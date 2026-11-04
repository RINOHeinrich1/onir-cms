import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateChatLinkInput } from "@/application/ports/chat-link-repository";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAiUsageRepository } from "@/infrastructure/db/ai-usage-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { sealAiKey } from "@/lib/ai-crypto";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let ownerOrg: string;
let targetOrg: string;
let grantor: string;
const originalProviderKey = process.env.AI_PROVIDER_KEY;

beforeAll(async () => {
  pool = await setupDb();
  ownerOrg = await makeOrganization(pool, "Org propriétaire IA");
  targetOrg = await makeOrganization(pool, "Org bénéficiaire IA");
  grantor = await makeUser(pool, "grantor@example.com", { superAdmin: true });
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

beforeEach(async () => {
  await pool.query("DELETE FROM chat_links");
  await pool.query("DELETE FROM ai_provider_grants");
  await pool.query("DELETE FROM ai_model_grants");
  await pool.query("DELETE FROM ai_cluster_grants");
  await pool.query("DELETE FROM ai_clusters");
  await pool.query("DELETE FROM ai_providers");
});

afterAll(async () => {
  if (originalProviderKey === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = originalProviderKey;
  vi.unstubAllGlobals();
  await pool.end();
});

function linkInput(overrides: Partial<CreateChatLinkInput> = {}): CreateChatLinkInput {
  return {
    tokenHash: `grant-${Math.random().toString(16).slice(2)}`,
    tokenEnc: "enc",
    label: "Lien partagé",
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

async function seedProvider(): Promise<{ providerId: string; models: string[] }> {
  const provider = await pool.query<{ id: string }>(
    `INSERT INTO ai_providers
       (organization_id, label, preset, dialect, base_url,
        api_key_ciphertext, api_key_iv, api_key_tag)
     VALUES ($1, 'Provider partagé', 'custom', 'openai', 'https://example.test/v1', 'c', 'i', 't')
     RETURNING id`,
    [ownerOrg],
  );
  const providerId = provider.rows[0]?.id;
  if (providerId === undefined) throw new Error("provider");
  await pool.query(
    `INSERT INTO ai_provider_models
       (organization_id, provider_id, model_id, label, source)
     VALUES ($1, $2, 'model-granted', 'Modèle partagé', 'manual'),
            ($1, $2, 'model-private', 'Modèle privé', 'manual')`,
    [ownerOrg, providerId],
  );
  return { providerId, models: ["model-granted", "model-private"] };
}

describe("partage du catalogue IA", () => {
  it("n'autorise pas un lien vers un fournisseur sans grant", async () => {
    const { providerId } = await seedProvider();
    const links = pgChatLinkRepository(pool);
    await expect(
      links.create(targetOrg, linkInput({ aiProviderId: providerId, aiModel: "model-granted" })),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("partage un fournisseur complet et ses modèles", async () => {
    const { providerId } = await seedProvider();
    await pgAiGrantRepository(pool).grant(targetOrg, { kind: "provider", providerId }, grantor);
    expect((await pgAiProviderRepository(pool).list(targetOrg)).map((p) => p.id)).toContain(
      providerId,
    );
    expect(
      (await pgAiProviderModelRepository(pool).list(targetOrg, providerId)).map((m) => m.modelId),
    ).toEqual(["model-granted", "model-private"]);
    await expect(
      pgChatLinkRepository(pool).create(
        targetOrg,
        linkInput({ aiProviderId: providerId, aiModel: "model-private" }),
      ),
    ).resolves.toMatchObject({ aiProviderId: providerId, aiModel: "model-private" });
    expect(
      await pgAiGrantRepository(pool).countUsage(targetOrg, { kind: "provider", providerId }),
    ).toBe(1);
  });

  it("partage un modèle isolément", async () => {
    const { providerId } = await seedProvider();
    await pgAiGrantRepository(pool).grant(
      targetOrg,
      { kind: "model", providerId, model: "model-granted" },
      grantor,
    );
    expect(
      (await pgAiProviderModelRepository(pool).list(targetOrg, providerId)).map((m) => m.modelId),
    ).toEqual(["model-granted"]);
    await expect(
      pgChatLinkRepository(pool).create(
        targetOrg,
        linkInput({ aiProviderId: providerId, aiModel: "model-private" }),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("résout un fournisseur partagé avec la clé du propriétaire", async () => {
    const sealed = sealAiKey("shared-secret-key");
    const provider = await pool.query<{ id: string }>(
      `INSERT INTO ai_providers
         (organization_id, label, preset, dialect, base_url,
          api_key_ciphertext, api_key_iv, api_key_tag, api_key_hint)
       VALUES ($1, 'Provider runtime partagé', 'custom', 'openai',
               'https://example.test/v1', $2, $3, $4, '••••1234')
       RETURNING id`,
      [ownerOrg, sealed.ciphertext, sealed.iv, sealed.tag],
    );
    const providerId = provider.rows[0]?.id;
    if (providerId === undefined) throw new Error("provider");
    await pool.query(
      `INSERT INTO ai_provider_models
         (organization_id, provider_id, model_id, label, source)
       VALUES ($1, $2, 'runtime-model', 'Runtime', 'manual')`,
      [ownerOrg, providerId],
    );
    await pgAiGrantRepository(pool).grant(targetOrg, { kind: "provider", providerId }, grantor);
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "partagé" } }],
            usage: { prompt_tokens: 4, completion_tokens: 1, total_tokens: 5 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const client = await pgAiClientFactory(pool).forTarget({
      organizationId: targetOrg,
      aiProviderId: providerId,
      aiModel: "runtime-model",
    });
    await expect(
      client.complete({ system: "sys", messages: [{ role: "user", content: "bonjour" }] }),
    ).resolves.toBe("partagé");
    const calls = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const headers = (calls?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer shared-secret-key");
    const events = await pool.query(
      "SELECT organization_id, provider_id FROM ai_usage_events WHERE organization_id = $1",
      [targetOrg],
    );
    expect(events.rows[0]).toMatchObject({ organization_id: targetOrg, provider_id: providerId });
  });

  it("partage un cluster et ses membres", async () => {
    const { providerId } = await seedProvider();
    const cluster = await pool.query<{ id: string }>(
      `INSERT INTO ai_clusters (organization_id, label) VALUES ($1, 'Cluster partagé') RETURNING id`,
      [ownerOrg],
    );
    const clusterId = cluster.rows[0]?.id;
    if (clusterId === undefined) throw new Error("cluster");
    await pool.query(
      `INSERT INTO ai_cluster_members
         (cluster_id, organization_id, position, provider_id, model)
       VALUES ($1, $2, 1, $3, 'model-granted')`,
      [clusterId, ownerOrg, providerId],
    );
    expect(await pgAiUsageRepository(pool).listClusters(targetOrg)).toEqual([]);
    await pgAiGrantRepository(pool).grant(targetOrg, { kind: "cluster", clusterId }, grantor);
    expect((await pgAiUsageRepository(pool).listClusters(targetOrg)).map((c) => c.id)).toContain(
      clusterId,
    );
    expect(await pgAiProviderRepository(pool).findById(targetOrg, providerId)).toBeNull();
    expect(
      await pgAiProviderModelRepository(pool).findByModelId(targetOrg, providerId, "model-granted"),
    ).toBeNull();
    expect(
      await pgAiProviderRepository(pool).findByIdForCluster(targetOrg, clusterId, providerId),
    ).not.toBeNull();
    expect(
      await pgAiProviderModelRepository(pool).findByModelIdForCluster(
        targetOrg,
        clusterId,
        providerId,
        "model-granted",
      ),
    ).not.toBeNull();
    await expect(
      pgChatLinkRepository(pool).create(
        targetOrg,
        linkInput({ aiProviderId: providerId, aiModel: "model-granted" }),
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
});
