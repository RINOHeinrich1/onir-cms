import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OrganizationChatbotLimitError } from "@/application/errors";
import type { CreateChatLinkInput } from "@/application/ports/chat-link-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgId: string;

beforeAll(async () => {
  pool = await setupDb();
  orgId = await makeOrganization(pool, "Org quotas IA");
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_links");
  await pool.query("DELETE FROM organization_ai_allocations");
  await pool.query("DELETE FROM organization_ai_budgets");
  await pool.query("DELETE FROM ai_usage_events");
  await pool.query("DELETE FROM ai_clusters");
  await pool.query("DELETE FROM ai_providers");
  await pool.query("UPDATE organizations SET max_chatbots = NULL WHERE id = $1", [orgId]);
});

afterAll(async () => {
  await pool.end();
});

function linkInput(overrides: Partial<CreateChatLinkInput> = {}): CreateChatLinkInput {
  return {
    tokenHash: `quota-${Math.random().toString(16).slice(2)}`,
    tokenEnc: "enc",
    label: "Lien quotas IA",
    type: "standard",
    surface: "page",
    identificationMode: "contact",
    prospectId: null,
    createdBy: null,
    expiresAt: null,
    sources: { connaissances: true, phototheque: true, lien: true },
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    widgetConfig: {},
    ...overrides,
  };
}

async function createProviderAndModel(): Promise<{ providerId: string; modelId: string }> {
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO ai_providers
       (organization_id, label, preset, dialect, base_url,
        api_key_ciphertext, api_key_iv, api_key_tag)
     VALUES ($1, 'Provider test', 'custom', 'openai', 'https://example.test/v1', 'c', 'i', 't')
     RETURNING id`,
    [orgId],
  );
  const providerId = provider.rows[0]?.id;
  if (providerId === undefined) throw new Error("provider");
  await pool.query(
    `INSERT INTO ai_provider_models
       (organization_id, provider_id, model_id, label, source)
     VALUES ($1, $2, 'model-test', 'Model test', 'manual')`,
    [orgId, providerId],
  );
  return { providerId, modelId: "model-test" };
}

async function createCluster(): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO ai_clusters (organization_id, label) VALUES ($1, 'Cluster test') RETURNING id`,
    [orgId],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error("cluster");
  return id;
}

describe("quotas organisation — persistance et absence de reset", () => {
  it("applique max_chatbots dans la base", async () => {
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const links = pgChatLinkRepository(pool);
    await quotas.saveLimits(orgId, {
      maxChatbots: 1,
      maxTokens: null,
      tokenResetMode: "manual",
      tokenResetDays: null,
      allocations: [],
    });

    await links.create(orgId, linkInput());
    await expect(links.create(orgId, linkInput())).rejects.toBeInstanceOf(
      OrganizationChatbotLimitError,
    );
    expect((await quotas.getLimits(orgId))?.chatbotsCount).toBe(1);
  });

  it("ne réinitialise jamais chat_links.tokens_used lors de la configuration", async () => {
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const links = pgChatLinkRepository(pool);
    const link = await links.create(orgId, linkInput({ maxTokens: 1000 }));
    await links.recordAiUsage?.(orgId, link.id, {
      conversationId: null,
      operation: "chat_reply",
      promptTokens: 40,
      completionTokens: 10,
      totalTokens: 50,
    });

    await quotas.saveLimits(orgId, {
      maxChatbots: null,
      maxTokens: 100,
      tokenResetMode: "manual",
      tokenResetDays: null,
      allocations: [],
    });

    expect((await quotas.getLimits(orgId))?.budget?.tokensUsed).toBe(0);
    const { rows } = await pool.query<{ tokens_used: string }>(
      "SELECT tokens_used FROM chat_links WHERE id = $1",
      [link.id],
    );
    expect(Number(rows[0]?.tokens_used)).toBe(50);
    const events = await pool.query("SELECT count(*)::int AS count FROM ai_usage_events");
    expect(events.rows[0]?.count).toBe(0);
  });

  it("compte le total, les modèles, les clusters et conserve l'audit au reset", async () => {
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const { providerId, modelId } = await createProviderAndModel();
    const clusterId = await createCluster();
    await quotas.saveLimits(orgId, {
      maxChatbots: null,
      maxTokens: 100,
      tokenResetMode: "manual",
      tokenResetDays: null,
      allocations: [
        { target: { kind: "model", providerId, model: modelId }, maxTokens: 80 },
        { target: { kind: "cluster", clusterId }, maxTokens: 60 },
      ],
    });

    await quotas.recordUsage({
      organizationId: orgId,
      providerId,
      providerLabel: "Provider test",
      model: modelId,
      clusterId,
      usage: "chat_reply",
      promptTokens: 15,
      completionTokens: 5,
      totalTokens: 20,
    });

    const after = await quotas.getLimits(orgId);
    expect(after?.budget?.tokensUsed).toBe(20);
    expect(after?.allocations.find((row) => row.target.kind === "model")?.tokensUsed).toBe(20);
    expect(after?.allocations.find((row) => row.target.kind === "cluster")?.tokensUsed).toBe(20);

    expect(await quotas.resetBudget(orgId)).toBe(true);
    const reset = await quotas.getLimits(orgId);
    expect(reset?.budget?.tokensUsed).toBe(0);
    expect(reset?.allocations.every((row) => row.tokensUsed === 0)).toBe(true);
    const events = await pool.query("SELECT count(*)::int AS count FROM ai_usage_events");
    expect(events.rows[0]?.count).toBe(1);
  });

  it("réconcilie l'historique legacy sans double compter le backfill", async () => {
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const link = await pgChatLinkRepository(pool).create(orgId, linkInput());
    const cutover = await pool.query<{ applied_at: Date }>(
      "SELECT applied_at FROM schema_migrations WHERE name = '0073_organization_ai_quotas.sql'",
    );
    const appliedAt = cutover.rows[0]?.applied_at;
    if (appliedAt === undefined) throw new Error("cutover introuvable");
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO chat_link_ai_usage
         (organization_id, link_id, operation, prompt_tokens, completion_tokens, total_tokens, created_at)
       VALUES ($1, $2, 'chat_reply', 10, 5, 15, $3)
       RETURNING id`,
      [orgId, link.id, new Date(appliedAt.getTime() - 86_400_000)],
    );
    const legacyId = legacy.rows[0]?.id;
    if (legacyId === undefined) throw new Error("legacy introuvable");

    const beforeBackfill = await quotas.getUsageOverview(orgId);
    expect(beforeBackfill.totalTokens).toBe(15);

    await pool.query(
      `INSERT INTO ai_usage_events
         (organization_id, provider_label, model, usage, link_id,
          prompt_tokens, completion_tokens, total_tokens, created_at, source, legacy_usage_id)
       VALUES ($1, 'Historique pré-journal', 'legacy-import', 'chat_reply', $2,
               10, 5, 15, $3, 'legacy_backfill', $4)`,
      [orgId, link.id, new Date(appliedAt.getTime() - 86_400_000), legacyId],
    );

    const afterBackfill = await quotas.getUsageOverview(orgId);
    expect(afterBackfill.totalTokens).toBe(15);
  });

  it("expose le total historique et les quotas enrichis pour le dashboard", async () => {
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const { providerId, modelId } = await createProviderAndModel();
    const clusterId = await createCluster();
    await quotas.saveLimits(orgId, {
      maxChatbots: null,
      maxTokens: 100,
      tokenResetMode: "manual",
      tokenResetDays: null,
      allocations: [
        { target: { kind: "model", providerId, model: modelId }, maxTokens: 80 },
        { target: { kind: "cluster", clusterId }, maxTokens: 60 },
      ],
    });
    await quotas.recordUsage({
      organizationId: orgId,
      providerId,
      providerLabel: "Provider test",
      model: modelId,
      clusterId,
      usage: "chat_reply",
      promptTokens: 15,
      completionTokens: 5,
      totalTokens: 20,
    });

    const overview = await quotas.getUsageOverview(orgId);
    expect(overview.totalTokens).toBe(20);
    expect(overview.budget?.tokensUsed).toBe(20);
    expect(overview.allocations.map((allocation) => allocation.label).sort()).toEqual([
      "Cluster test",
      "Provider test · model-test",
    ]);
    expect(overview.allocations.every((allocation) => allocation.tokensUsed === 20)).toBe(true);

    await quotas.resetBudget(orgId);
    const afterReset = await quotas.getUsageOverview(orgId);
    expect(afterReset.totalTokens).toBe(20);
    expect(afterReset.budget?.tokensUsed).toBe(0);
    expect(afterReset.allocations.every((allocation) => allocation.tokensUsed === 0)).toBe(true);
  });

  it("réinitialise automatiquement une période duration expirée", async () => {
    const quotas = pgOrganizationAiQuotaRepository(pool);
    const { providerId, modelId } = await createProviderAndModel();
    await quotas.saveLimits(orgId, {
      maxChatbots: null,
      maxTokens: 100,
      tokenResetMode: "duration",
      tokenResetDays: 1,
      allocations: [{ target: { kind: "model", providerId, model: modelId }, maxTokens: 100 }],
    });
    await quotas.recordUsage({
      organizationId: orgId,
      providerId,
      providerLabel: "Provider test",
      model: modelId,
      clusterId: null,
      usage: "chat_reply",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
    });
    await pool.query(
      "UPDATE organization_ai_budgets SET token_period_started_at = now() - interval '2 days' WHERE organization_id = $1",
      [orgId],
    );

    const state = await quotas.readState(orgId);
    expect(state.budget?.tokensUsed).toBe(0);
    expect(state.allocations[0]?.tokensUsed).toBe(0);
  });
});
