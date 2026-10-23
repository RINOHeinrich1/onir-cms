import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AiNotConfiguredError, AiProviderUnavailableError } from "@/application/errors";
import { createAiProvider } from "@/application/use-cases/ai/manage-ai-providers";
import { createAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
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
  delete process.env.AI_API_TOKEN;
  delete process.env.AI_PRODUCT_ID;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  for (const [key, value] of Object.entries(ORIGINAL)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

async function setup() {
  const providers = memoryAiProviderRepository();
  const models = memoryAiModelRepository();
  const deps = { providers: providers.repo, models: models.repo };
  const provider = await createAiProvider(deps, testActor, {
    label: "OpenAI",
    preset: "openai",
    apiKey: "sk-123456",
  });
  await models.repo.create("org-1", provider.id, {
    modelId: "gpt-4o-mini",
    source: "manual",
    createdBy: null,
  });
  return {
    providers,
    models,
    provider,
    factory: createAiClientFactory(deps),
  };
}

describe("ai-client-factory — précédence", () => {
  it("choisit le fournisseur/modèle explicite du lien", async () => {
    const { factory, provider } = await setup();
    await expect(
      factory.resolve({
        organizationId: "org-1",
        aiProviderId: provider.id,
        aiModel: "gpt-4o-mini",
      }),
    ).resolves.toMatchObject({
      source: "link",
      providerId: provider.id,
      providerLabel: "OpenAI",
      model: "gpt-4o-mini",
    });
  });

  it("hérite du défaut de l'organisation", async () => {
    const { factory, provider, providers } = await setup();
    providers.setSettings({
      organizationId: "org-1",
      defaultProviderId: provider.id,
      defaultModel: "gpt-4o-mini",
      updatedAt: new Date().toISOString(),
    });
    await expect(
      factory.resolve({ organizationId: "org-1", aiProviderId: null, aiModel: null }),
    ).resolves.toMatchObject({ source: "organization", providerId: provider.id });
  });

  it("retombe sur le legacy sans fournisseur", async () => {
    const { factory } = await setup();
    process.env.AI_API_TOKEN = "legacy-token";
    process.env.AI_PRODUCT_ID = "12345";
    delete process.env.AI_MODEL;
    await expect(
      factory.resolve({ organizationId: "org-1", aiProviderId: null, aiModel: null }),
    ).resolves.toMatchObject({
      source: "legacy",
      providerId: null,
      providerLabel: "Infomaniak (legacy)",
      model: "Qwen/Qwen3.5-122B-A10B-FP8",
    });
  });

  it("échoue si rien n'est configuré", async () => {
    const { factory } = await setup();
    await expect(factory.resolve(null)).rejects.toBeInstanceOf(AiNotConfiguredError);
  });

  it("refuse un fournisseur archivé sans bascule silencieuse", async () => {
    const { factory, provider, providers } = await setup();
    await providers.repo.archive("org-1", provider.id);
    await expect(
      factory.resolve({
        organizationId: "org-1",
        aiProviderId: provider.id,
        aiModel: "gpt-4o-mini",
      }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it("refuse un modèle désactivé", async () => {
    const { factory, provider, models } = await setup();
    const model = await models.repo.findByModelId("org-1", provider.id, "gpt-4o-mini");
    await models.repo.setEnabled("org-1", provider.id, model?.id ?? "", false);
    await expect(
      factory.resolve({
        organizationId: "org-1",
        aiProviderId: provider.id,
        aiModel: "gpt-4o-mini",
      }),
    ).rejects.toBeInstanceOf(AiProviderUnavailableError);
  });

  it("optionalTarget renvoie null pour une configuration indisponible", async () => {
    const { factory } = await setup();
    await expect(factory.optionalTarget(null)).resolves.toBeNull();
  });
});
