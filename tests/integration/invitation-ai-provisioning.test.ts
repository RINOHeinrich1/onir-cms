import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { encryptLinkToken } from "@/lib/link-crypto";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let ownerOrg: string;
let invitedBy: string;
let providerId: string;
let clusterId: string;
const originalKey = process.env.LINK_TOKEN_KEY;

beforeAll(async () => {
  process.env.LINK_TOKEN_KEY = "a".repeat(64);
  pool = await setupDb();
  ownerOrg = await makeOrganization(pool, "Org propriétaire invitation");
  invitedBy = await makeUser(pool, "inviter-provisioning@example.com", { superAdmin: true });
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO ai_providers
       (organization_id, label, preset, dialect, base_url,
        api_key_ciphertext, api_key_iv, api_key_tag)
     VALUES ($1, 'Provider invitation', 'custom', 'openai',
             'https://example.test/v1', 'c', 'i', 't')
     RETURNING id`,
    [ownerOrg],
  );
  providerId = provider.rows[0]?.id ?? "";
  await pool.query(
    `INSERT INTO ai_provider_models
       (organization_id, provider_id, model_id, label, source)
     VALUES ($1, $2, 'model-invitation', 'Modèle invitation', 'manual')`,
    [ownerOrg, providerId],
  );
  const cluster = await pool.query<{ id: string }>(
    `INSERT INTO ai_clusters (organization_id, label) VALUES ($1, 'Cluster invitation') RETURNING id`,
    [ownerOrg],
  );
  clusterId = cluster.rows[0]?.id ?? "";
  await pool.query(
    `INSERT INTO ai_cluster_members
       (cluster_id, organization_id, position, provider_id, model)
     VALUES ($1, $2, 1, $3, 'model-invitation')`,
    [clusterId, ownerOrg, providerId],
  );
});

afterAll(async () => {
  if (originalKey === undefined) delete process.env.LINK_TOKEN_KEY;
  else process.env.LINK_TOKEN_KEY = originalKey;
  await pool.end();
});

function provisioning(): OrganizationProvisioning {
  return {
    maxChatbots: 2,
    maxTokens: 1000,
    tokenResetMode: "manual",
    tokenResetDays: null,
    allocations: [
      {
        target: { kind: "model", providerId, model: "model-invitation" },
        maxTokens: 500,
      },
      { target: { kind: "cluster", clusterId }, maxTokens: 400 },
    ],
    defaults: [
      {
        usage: "response",
        target: { kind: "model", providerId, model: "model-invitation" },
      },
      { usage: "assistant", target: { kind: "cluster", clusterId } },
    ],
  };
}

describe("provisioning IA d'une invitation", () => {
  it("applique les grants, quotas et défauts à l'acceptation", async () => {
    const repo = pgInvitationRepository(pool);
    const token = createInvitationToken();
    await repo.create({
      tokenHash: hashInvitationToken(token),
      tokenEnc: encryptLinkToken(token),
      organizationId: null,
      role: "admin",
      invitedBy,
      expiresAt: new Date(Date.now() + 60_000),
      provisioning: provisioning(),
    });

    const result = await repo.accept({
      tokenHash: hashInvitationToken(token),
      name: "Nouvelle Agence",
      email: "nouvelle-agence@example.com",
      password: "mot-de-passe-test",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const organization = await pool.query<{ max_chatbots: number | null }>(
      "SELECT max_chatbots FROM organizations WHERE id = $1",
      [result.organizationId],
    );
    expect(organization.rows[0]?.max_chatbots).toBe(2);

    const budget = await pool.query<{ max_tokens: string | null; tokens_used: string }>(
      "SELECT max_tokens, tokens_used FROM organization_ai_budgets WHERE organization_id = $1",
      [result.organizationId],
    );
    expect(Number(budget.rows[0]?.max_tokens)).toBe(1000);
    expect(Number(budget.rows[0]?.tokens_used)).toBe(0);

    const allocations = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM organization_ai_allocations WHERE organization_id = $1",
      [result.organizationId],
    );
    expect(allocations.rows[0]?.count).toBe("2");

    const grants = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ai_model_grants WHERE organization_id = $1",
      [result.organizationId],
    );
    expect(grants.rows[0]?.count).toBe("1");
    const clusterGrants = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM ai_cluster_grants WHERE organization_id = $1",
      [result.organizationId],
    );
    expect(clusterGrants.rows[0]?.count).toBe("1");

    const defaults = await pool.query<{ usage: string }>(
      "SELECT usage FROM organization_ai_usage_defaults WHERE organization_id = $1 ORDER BY usage",
      [result.organizationId],
    );
    expect(defaults.rows.map((row) => row.usage)).toEqual(["assistant", "response"]);
  });
});
