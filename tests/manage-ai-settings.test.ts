import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotFoundError } from "@/application/errors";
import {
  archiveAiProvider,
  createAiProvider,
} from "@/application/use-cases/ai/manage-ai-providers";
import {
  clearOrganizationDefault,
  getOrganizationAiSettings,
  importLegacyAiProvider,
  setOrganizationDefault,
  setOrganizationExtraction,
} from "@/application/use-cases/ai/manage-ai-settings";
import { memoryAiModelRepository } from "./helpers/ai-model-memory";
import { memoryAiProviderRepository, testActor } from "./helpers/ai-provider-memory";

const ORIGINAL = {
  AI_PROVIDER_KEY: process.env.AI_PROVIDER_KEY,
  AI_API_TOKEN: process.env.AI_API_TOKEN,
  AI_PRODUCT_ID: process.env.AI_PRODUCT_ID,
  AI_MODEL: process.env.AI_MODEL,
};

beforeEach(() => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("manage-ai-settings", () => {
  it("définit puis efface le défaut de l'organisation", async () => {
    const memory = memoryAiProviderRepository();
    const d = { providers: memory.repo };
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    const settings = await setOrganizationDefault(d, testActor, {
      providerId: created.id,
      model: "gpt-4o-mini",
    });
    expect(settings.defaultProviderId).toBe(created.id);
    expect(await getOrganizationAiSettings(d, testActor)).toMatchObject({
      defaultModel: "gpt-4o-mini",
    });
    await clearOrganizationDefault(d, testActor);
    expect(await getOrganizationAiSettings(d, testActor)).toBeNull();
  });

  it("enregistre un modèle d'extraction et son secours", async () => {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const d = { providers: providers.repo, models: models.repo };
    const primary = await createAiProvider(d, testActor, {
      label: "Infomaniak",
      preset: "infomaniak",
      productId: "42",
      apiKey: "k".repeat(64),
    });
    const fallback = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    await models.repo.create("org-1", primary.id, {
      modelId: "google/gemma-4-31B-it",
      source: "manual",
      createdBy: null,
    });
    await models.repo.create("org-1", fallback.id, {
      modelId: "gpt-4o-mini",
      source: "manual",
      createdBy: null,
    });
    const settings = await setOrganizationExtraction(d, testActor, {
      providerId: primary.id,
      model: "google/gemma-4-31B-it",
      fallbackProviderId: fallback.id,
      fallbackModel: "gpt-4o-mini",
    });
    expect(settings.extractionProviderId).toBe(primary.id);
    expect(settings.extractionFallbackModel).toBe("gpt-4o-mini");
  });

  it("refuse un fournisseur archivé", async () => {
    const memory = memoryAiProviderRepository();
    const d = { providers: memory.repo };
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    await archiveAiProvider(d, testActor, created.id);
    await expect(
      setOrganizationDefault(d, testActor, { providerId: created.id, model: "gpt-4o-mini" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("importe la configuration legacy et la pose en défaut", async () => {
    process.env.AI_API_TOKEN = "legacy-token";
    process.env.AI_PRODUCT_ID = "12345";
    delete process.env.AI_MODEL;
    const memory = memoryAiProviderRepository();
    const d = { providers: memory.repo };
    const imported = await importLegacyAiProvider(d, testActor);
    expect(imported.label).toBe("Infomaniak (environnement)");
    expect(imported.baseUrl).toContain("/2/ai/12345/openai/v1");
    expect(imported.defaultModel).toBe("Qwen/Qwen3.5-122B-A10B-FP8");
    expect((await getOrganizationAiSettings(d, testActor))?.defaultProviderId).toBe(imported.id);
  });

  it("refuse un défaut qui n'est pas un modèle actif enregistré", async () => {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const d = { providers: providers.repo, models: models.repo };
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    await expect(
      setOrganizationDefault(d, testActor, { providerId: created.id, model: "gpt-4o-mini" }),
    ).rejects.toThrow("modèle actif");
  });

  it("crée le modèle legacy lors de l'import", async () => {
    process.env.AI_API_TOKEN = "legacy-token";
    process.env.AI_PRODUCT_ID = "12345";
    delete process.env.AI_MODEL;
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const d = { providers: providers.repo, models: models.repo };
    const imported = await importLegacyAiProvider(d, testActor);
    const rows = await models.repo.list("org-1", imported.id);
    expect(rows.map((row) => row.modelId)).toEqual(["Qwen/Qwen3.5-122B-A10B-FP8"]);
    expect(rows[0]?.enabled).toBe(true);
  });

  it("refuse l'import sans configuration legacy", async () => {
    delete process.env.AI_API_TOKEN;
    delete process.env.AI_PRODUCT_ID;
    const memory = memoryAiProviderRepository();
    await expect(importLegacyAiProvider({ providers: memory.repo }, testActor)).rejects.toThrow();
  });
});
