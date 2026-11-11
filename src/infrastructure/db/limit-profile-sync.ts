import type { Pool, PoolClient } from "pg";
import type { LimitProfile } from "@/application/ports/limit-profile-repository";
import { AI_USAGES } from "@/domain/entities/ai-usage";
import type { OrganizationAiTarget } from "@/domain/entities/organization-ai-quota";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";

type ProfileRow = {
  id: string;
  name: string;
  description: string;
  provisioning: unknown;
  active: boolean;
  created_at: Date;
  updated_at: Date;
};

type AllocationRow = {
  id: string;
  target_kind: string;
  provider_id: string | null;
  model: string | null;
  cluster_id: string | null;
  max_tokens: string | null;
};

function targetKey(target: OrganizationAiTarget): string {
  return target.kind === "model"
    ? `model:${target.providerId}:${target.model}`
    : `cluster:${target.clusterId}`;
}

function profileFromRow(row: ProfileRow): LimitProfile {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    provisioning: row.provisioning as OrganizationProvisioning,
    active: row.active,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function loadLimitProfileWithClient(
  client: PoolClient,
  id: string,
): Promise<LimitProfile | null> {
  const { rows } = await client.query<ProfileRow>(
    `SELECT id, name, description, provisioning, active, created_at, updated_at
       FROM limit_profiles WHERE id = $1`,
    [id],
  );
  return rows[0] ? profileFromRow(rows[0]) : null;
}

function defaultsFor(provisioning: OrganizationProvisioning) {
  if (provisioning.defaults.length > 0) return provisioning.defaults;
  const first = provisioning.allocations[0];
  return first === undefined ? [] : AI_USAGES.map((usage) => ({ usage, target: first.target }));
}

/**
 * Applique un profil à une organisation dans une transaction existante.
 * Les compteurs de consommation ne sont jamais remis à zéro.
 */
export async function applyLimitProfileWithClient(
  client: PoolClient,
  organizationId: string,
  profile: LimitProfile,
  appliedBy: string,
): Promise<void> {
  const organization = await client.query("SELECT 1 FROM organizations WHERE id = $1 FOR UPDATE", [
    organizationId,
  ]);
  if ((organization.rowCount ?? 0) === 0) throw new Error("Organisation introuvable");

  const provisioning = profile.provisioning;
  await client.query(
    `UPDATE organizations
        SET max_chatbots = $2, limit_profile_id = $3,
            max_storage_bytes = $4, updated_at = now()
      WHERE id = $1`,
    [
      organizationId,
      provisioning.maxChatbots,
      profile.id,
      provisioning.maxStorageMb === null || provisioning.maxStorageMb === undefined
        ? null
        : provisioning.maxStorageMb * 1024 * 1024,
    ],
  );
  await client.query(
    `INSERT INTO organization_ai_budgets
       (organization_id, max_tokens, max_messages, message_limit_policy, token_reset_mode, token_reset_days)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (organization_id) DO UPDATE
       SET max_tokens = EXCLUDED.max_tokens,
           max_messages = EXCLUDED.max_messages,
           message_limit_policy = EXCLUDED.message_limit_policy,
           token_reset_mode = EXCLUDED.token_reset_mode,
           token_reset_days = EXCLUDED.token_reset_days,
           updated_at = now()`,
    [
      organizationId,
      provisioning.maxTokens,
      provisioning.maxMessages ?? null,
      provisioning.messageLimitPolicy ?? "block",
      provisioning.tokenResetMode,
      provisioning.tokenResetMode === "duration" ? provisioning.tokenResetDays : null,
    ],
  );

  const existing = await client.query<AllocationRow>(
    `SELECT id, target_kind, provider_id, model, cluster_id, max_tokens
       FROM organization_ai_allocations
      WHERE organization_id = $1
      FOR UPDATE`,
    [organizationId],
  );
  const desiredKeys = new Set(provisioning.allocations.map((entry) => targetKey(entry.target)));
  for (const row of existing.rows) {
    const key =
      row.target_kind === "cluster"
        ? targetKey({ kind: "cluster", clusterId: row.cluster_id ?? "" })
        : targetKey({
            kind: "model",
            providerId: row.provider_id ?? "",
            model: row.model ?? "",
          });
    if (!desiredKeys.has(key)) {
      await client.query("DELETE FROM organization_ai_allocations WHERE id = $1", [row.id]);
    }
  }

  await client.query(
    "DELETE FROM ai_model_grants WHERE organization_id = $1 AND managed_by_profile_id IS NOT NULL",
    [organizationId],
  );
  await client.query(
    "DELETE FROM ai_cluster_grants WHERE organization_id = $1 AND managed_by_profile_id IS NOT NULL",
    [organizationId],
  );

  for (const allocation of provisioning.allocations) {
    const target = allocation.target;
    if (target.kind === "model") {
      await client.query(
        `INSERT INTO ai_model_grants
           (organization_id, provider_id, model_id, granted_by, managed_by_profile_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id, provider_id, model_id) DO UPDATE
           SET managed_by_profile_id = EXCLUDED.managed_by_profile_id`,
        [organizationId, target.providerId, target.model, appliedBy, profile.id],
      );
      await client.query(
        `INSERT INTO organization_ai_allocations
           (organization_id, target_kind, provider_id, model, max_tokens)
         VALUES ($1, 'model', $2, $3, $4)
         ON CONFLICT (organization_id, provider_id, model) WHERE target_kind = 'model'
         DO UPDATE SET max_tokens = EXCLUDED.max_tokens, updated_at = now()`,
        [organizationId, target.providerId, target.model, allocation.maxTokens],
      );
      continue;
    }
    await client.query(
      `INSERT INTO ai_cluster_grants
         (organization_id, cluster_id, granted_by, managed_by_profile_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (organization_id, cluster_id) DO UPDATE
         SET managed_by_profile_id = EXCLUDED.managed_by_profile_id`,
      [organizationId, target.clusterId, appliedBy, profile.id],
    );
    await client.query(
      `INSERT INTO organization_ai_allocations
         (organization_id, target_kind, cluster_id, max_tokens)
       VALUES ($1, 'cluster', $2, $3)
       ON CONFLICT (organization_id, cluster_id) WHERE target_kind = 'cluster'
       DO UPDATE SET max_tokens = EXCLUDED.max_tokens, updated_at = now()`,
      [organizationId, target.clusterId, allocation.maxTokens],
    );
  }

  await client.query("DELETE FROM organization_ai_usage_defaults WHERE organization_id = $1", [
    organizationId,
  ]);
  for (const entry of defaultsFor(provisioning)) {
    await client.query(
      `INSERT INTO organization_ai_usage_defaults
         (organization_id, usage, target_kind, provider_id, model, cluster_id, updated_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (organization_id, usage) DO UPDATE
         SET target_kind = EXCLUDED.target_kind,
             provider_id = EXCLUDED.provider_id,
             model = EXCLUDED.model,
             cluster_id = EXCLUDED.cluster_id,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()`,
      [
        organizationId,
        entry.usage,
        entry.target.kind,
        entry.target.kind === "model" ? entry.target.providerId : null,
        entry.target.kind === "model" ? entry.target.model : null,
        entry.target.kind === "cluster" ? entry.target.clusterId : null,
        appliedBy,
      ],
    );
  }
}

export async function applyLimitProfileToOrganization(
  pool: Pool,
  organizationId: string,
  profile: LimitProfile,
  appliedBy: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await applyLimitProfileWithClient(client, organizationId, profile, appliedBy);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function syncLimitProfileToOrganizations(
  pool: Pool,
  profile: LimitProfile,
  appliedBy: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const organizations = await client.query<{ id: string }>(
      "SELECT id FROM organizations WHERE limit_profile_id = $1 FOR UPDATE",
      [profile.id],
    );
    for (const organization of organizations.rows) {
      await applyLimitProfileWithClient(client, organization.id, profile, appliedBy);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
