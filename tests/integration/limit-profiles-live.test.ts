import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrganizationProvisioning } from "@/domain/entities/organization-provisioning";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { pgLimitProfileRepository } from "@/infrastructure/db/limit-profile-repository";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { encryptLinkToken } from "@/lib/link-crypto";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let organizationId: string;
let userId: string;
let providerId: string;

beforeAll(async () => {
  pool = await setupDb();
  organizationId = await makeOrganization(pool, "Org profil vivant");
  userId = await makeUser(pool, "profile-live@example.com", { superAdmin: true });
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO ai_providers
       (organization_id, label, preset, dialect, base_url,
        api_key_ciphertext, api_key_iv, api_key_tag)
     VALUES ($1, 'Provider profil', 'custom', 'openai',
             'https://example.test/v1', 'c', 'i', 't')
     RETURNING id`,
    [organizationId],
  );
  providerId = provider.rows[0]?.id ?? "";
  await pool.query(
    `INSERT INTO ai_provider_models
       (organization_id, provider_id, model_id, label, source)
     VALUES ($1, $2, 'model-profile', 'Modèle profil', 'manual')`,
    [organizationId, providerId],
  );
});

afterAll(async () => {
  await pool.end();
});

function provisioning(maxChatbots: number, maxTokens: number): OrganizationProvisioning {
  return {
    maxChatbots,
    maxTokens,
    tokenResetMode: "manual",
    tokenResetDays: null,
    allocations: [
      {
        target: { kind: "model", providerId, model: "model-profile" },
        maxTokens: 500,
      },
    ],
    defaults: [
      {
        usage: "response",
        target: { kind: "model", providerId, model: "model-profile" },
      },
    ],
  };
}

describe("profils de limites vivants", () => {
  it("applique immédiatement les changements et conserve les compteurs", async () => {
    const profiles = pgLimitProfileRepository(pool);
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const profile = await profiles.create({
      name: "Profil vivant",
      description: "",
      provisioning: provisioning(3, 1000),
      active: true,
      createdBy: userId,
    });

    await profiles.applyToOrganization(organizationId, profile.id, userId);
    const organization = await pool.query<{ max_chatbots: number; limit_profile_id: string }>(
      "SELECT max_chatbots, limit_profile_id FROM organizations WHERE id = $1",
      [organizationId],
    );
    expect(organization.rows[0]).toMatchObject({
      max_chatbots: 3,
      limit_profile_id: profile.id,
    });
    const grant = await pool.query<{ managed_by_profile_id: string }>(
      "SELECT managed_by_profile_id FROM ai_model_grants WHERE organization_id = $1",
      [organizationId],
    );
    expect(grant.rows[0]?.managed_by_profile_id).toBe(profile.id);

    await quotas.recordUsage({
      organizationId,
      providerId,
      providerLabel: "Provider profil",
      model: "model-profile",
      clusterId: null,
      usage: "chat_reply",
      promptTokens: 30,
      completionTokens: 20,
      totalTokens: 50,
    });

    const updated = await profiles.update(profile.id, {
      provisioning: provisioning(2, 2000),
    });
    expect(updated).not.toBeNull();
    if (updated === null) return;
    await profiles.syncToOrganizations(updated, userId);

    const after = await pool.query<{ max_chatbots: number }>(
      "SELECT max_chatbots FROM organizations WHERE id = $1",
      [organizationId],
    );
    expect(after.rows[0]?.max_chatbots).toBe(2);
    const limits = await quotas.getLimits(organizationId);
    expect(limits?.budget?.maxTokens).toBe(2000);
    expect(limits?.budget?.tokensUsed).toBe(50);
    expect(limits?.allocations[0]?.tokensUsed).toBe(50);
  });

  it("applique le profil courant à l'acceptation d'une invitation", async () => {
    const profiles = pgLimitProfileRepository(pool);
    const profile = await profiles.create({
      name: "Profil invitation",
      description: "",
      provisioning: provisioning(2, 300),
      active: true,
      createdBy: userId,
    });
    const invitations = pgInvitationRepository(pool);
    const token = createInvitationToken();
    await invitations.create({
      tokenHash: hashInvitationToken(token),
      tokenEnc: encryptLinkToken(token),
      organizationId: null,
      role: "admin",
      invitedBy: userId,
      expiresAt: new Date(Date.now() + 60_000),
      limitProfileId: profile.id,
    });
    const accepted = await invitations.accept({
      tokenHash: hashInvitationToken(token),
      name: "Organisation profil",
      email: `profil-${Date.now()}@example.com`,
      password: "mot-de-passe-test",
    });
    expect(accepted.ok).toBe(true);
    if (!accepted.ok) return;
    const organization = await pool.query<{ max_chatbots: number; limit_profile_id: string }>(
      "SELECT max_chatbots, limit_profile_id FROM organizations WHERE id = $1",
      [accepted.organizationId],
    );
    expect(organization.rows[0]).toMatchObject({
      max_chatbots: 2,
      limit_profile_id: profile.id,
    });
  });
});
