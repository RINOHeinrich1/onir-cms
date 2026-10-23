import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { sealAiKey } from "@/lib/ai-crypto";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;
const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeAll(async () => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
  pool = await setupDb();
  orgA = await makeOrganization(pool, "Org modèles A");
  orgB = await makeOrganization(pool, "Org modèles B");
});

beforeEach(async () => {
  await pool.query("DELETE FROM organization_ai_settings");
  await pool.query("DELETE FROM chat_links");
  await pool.query("DELETE FROM ai_provider_models");
  await pool.query("DELETE FROM ai_providers");
});

afterAll(async () => {
  await pool.end();
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

async function makeProvider(org: string, label: string) {
  const sealed = sealAiKey("sk-test-1234");
  return pgAiProviderRepository(pool).create(org, {
    label,
    preset: "openai",
    dialect: "openai",
    baseUrl: "https://api.openai.com/v1",
    sealedKey: sealed,
    apiKeyHint: sealed.hint,
    defaultModel: null,
    createdBy: null,
  });
}

describe("ai_provider_models — persistance", () => {
  it("crée un modèle manuel et isole les organisations", async () => {
    const providerA = await makeProvider(orgA, "Provider A");
    const providerB = await makeProvider(orgB, "Provider B");
    const models = pgAiProviderModelRepository(pool);
    const manual = await models.create(orgA, providerA.id, {
      modelId: "manual/x",
      source: "manual",
      createdBy: null,
    });
    expect(manual.label).toBe("manual/x");
    expect(await models.list(orgB, providerB.id)).toHaveLength(0);
    expect(await models.findById(orgA, providerA.id, manual.id)).not.toBeNull();
    expect(await models.findById(orgB, providerA.id, manual.id)).toBeNull();
  });

  it("synchronise sans réactiver ni supprimer", async () => {
    const provider = await makeProvider(orgA, "Sync");
    const models = pgAiProviderModelRepository(pool);
    const manual = await models.create(orgA, provider.id, {
      modelId: "manual/keep",
      source: "manual",
      createdBy: null,
    });
    await models.syncCatalog(orgA, provider.id, ["Qwen/alpha", "Qwen/beta"]);
    const beta = await models.findByModelId(orgA, provider.id, "Qwen/beta");
    expect(beta).not.toBeNull();
    await models.setEnabled(orgA, provider.id, beta?.id ?? "", false);
    await models.syncCatalog(orgA, provider.id, ["Qwen/alpha", "Qwen/beta"]);
    const after = await models.list(orgA, provider.id);
    expect(after.find((row) => row.modelId === "Qwen/beta")?.enabled).toBe(false);
    expect(after.find((row) => row.modelId === "manual/keep")?.id).toBe(manual.id);
    expect(after).toHaveLength(3);
  });

  it("refuse un doublon et protège la FK fournisseur", async () => {
    const provider = await makeProvider(orgA, "Doublon");
    const models = pgAiProviderModelRepository(pool);
    await models.create(orgA, provider.id, {
      modelId: "manual/x",
      source: "manual",
      createdBy: null,
    });
    await expect(
      models.create(orgA, provider.id, {
        modelId: "manual/x",
        source: "manual",
        createdBy: null,
      }),
    ).rejects.toMatchObject({ code: "23505" });
    await expect(
      models.create(orgB, provider.id, {
        modelId: "manual/y",
        source: "manual",
        createdBy: null,
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("compte les liens et supprime un modèle non utilisé", async () => {
    const provider = await makeProvider(orgA, "Liens modèles");
    const models = pgAiProviderModelRepository(pool);
    const model = await models.create(orgA, provider.id, {
      modelId: "manual/x",
      source: "manual",
      createdBy: null,
    });
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO chat_links (organization_id, token_hash, type, label)
       VALUES ($1, 'hash-model-test', 'standard', 'Lien modèle') RETURNING id`,
      [orgA],
    );
    await pool.query("UPDATE chat_links SET ai_provider_id = $1, ai_model = $2 WHERE id = $3", [
      provider.id,
      "manual/x",
      rows[0]?.id,
    ]);
    expect(await models.countLinksUsing(orgA, provider.id, "manual/x")).toBe(1);
    expect(await models.remove(orgA, provider.id, model.id)).toBe(true);
    expect(await models.findById(orgA, provider.id, model.id)).toBeNull();
  });
});
