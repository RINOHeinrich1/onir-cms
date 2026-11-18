import type { PoolClient } from "pg";
import { AI_USAGES } from "@/domain/entities/ai-usage";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";

/**
 * Applique le snapshot IA d'une invitation dans la transaction de création de
 * l'organisation. Les grants sont posés avant les défauts, dont les triggers
 * vérifient l'accès.
 */
export async function provisionInvitationAiWithClient(
  client: PoolClient,
  organizationId: string,
  provisioning: OrganizationProvisioning | null,
  grantedBy: string,
): Promise<void> {
  if (provisioning === null) return;

  await client.query(
    `UPDATE organizations
        SET max_chatbots = $2, max_storage_bytes = $3, updated_at = now()
      WHERE id = $1`,
    [
      organizationId,
      provisioning.maxChatbots,
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

  for (const allocation of provisioning.allocations) {
    if (allocation.target.kind === "model") {
      await client.query(
        `INSERT INTO ai_model_grants (organization_id, provider_id, model_id, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id, provider_id, model_id) DO NOTHING`,
        [organizationId, allocation.target.providerId, allocation.target.model, grantedBy],
      );
      await client.query(
        `INSERT INTO organization_ai_allocations
           (organization_id, target_kind, provider_id, model, max_tokens)
         VALUES ($1, 'model', $2, $3, $4)
         ON CONFLICT (organization_id, provider_id, model) WHERE target_kind = 'model'
         DO UPDATE SET max_tokens = EXCLUDED.max_tokens, updated_at = now()`,
        [
          organizationId,
          allocation.target.providerId,
          allocation.target.model,
          allocation.maxTokens,
        ],
      );
      continue;
    }
    await client.query(
      `INSERT INTO ai_cluster_grants (organization_id, cluster_id, granted_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (organization_id, cluster_id) DO NOTHING`,
      [organizationId, allocation.target.clusterId, grantedBy],
    );
    await client.query(
      `INSERT INTO organization_ai_allocations
         (organization_id, target_kind, cluster_id, max_tokens)
       VALUES ($1, 'cluster', $2, $3)
       ON CONFLICT (organization_id, cluster_id) WHERE target_kind = 'cluster'
       DO UPDATE SET max_tokens = EXCLUDED.max_tokens, updated_at = now()`,
      [organizationId, allocation.target.clusterId, allocation.maxTokens],
    );
  }

  const firstAllocation = provisioning.allocations[0];
  const defaults =
    provisioning.defaults.length === 0 && firstAllocation !== undefined
      ? AI_USAGES.map((usage) => ({ usage, target: firstAllocation.target }))
      : provisioning.defaults;

  for (const entry of defaults) {
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
        grantedBy,
      ],
    );
  }
}
