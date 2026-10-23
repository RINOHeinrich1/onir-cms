import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConflictError } from "@/application/errors";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { AiModelCatalog } from "@/application/ports/ai-model-catalog";
import {
  addManualProviderModel,
  listProviderModels,
  removeProviderModel,
  setProviderDefaultModel,
  setProviderModelEnabled,
  syncProviderModels,
  testProviderModel,
} from "@/application/use-cases/ai/manage-ai-models";
import { createAiProvider } from "@/application/use-cases/ai/manage-ai-providers";
import { memoryAiModelRepository } from "./helpers/ai-model-memory";
import { memoryAiProviderRepository, testActor } from "./helpers/ai-provider-memory";

const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeEach(() => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

function setup() {
  const providers = memoryAiProviderRepository();
  const models = memoryAiModelRepository();
  const catalog: AiModelCatalog = {
    async listModels() {
      return {
        models: ["Qwen/alpha", "Qwen/beta"],
        modelsAvailable: true,
        latencyMs: 10,
      };
    },
    async testConnection() {
      return { ok: true, latencyMs: 10, modelsCount: 2, modelsAvailable: true, error: "" };
    },
  };
  const deps = { providers: providers.repo, models: models.repo, catalog };
  return { providers, models, deps };
}

async function createProvider(deps: ReturnType<typeof setup>["deps"]) {
  return createAiProvider(deps, testActor, {
    label: "OpenAI",
    preset: "openai",
    apiKey: "sk-123456",
  });
}

describe("manage-ai-models", () => {
  it("synchronise le catalogue sans perdre les modèles locaux", async () => {
    const { deps, models } = setup();
    const provider = await createProvider(deps);
    await addManualProviderModel(deps, testActor, provider.id, { modelId: "manual/x" });
    const result = await syncProviderModels(deps, testActor, provider.id);
    expect(result.catalogSize).toBe(2);
    expect(result.imported).toBe(2);
    expect(result.models.map((model) => model.modelId)).toEqual([
      "manual/x",
      "Qwen/alpha",
      "Qwen/beta",
    ]);
    expect(models.models).toHaveLength(3);
  });

  it("ne réactive pas un modèle désactivé lors d'une nouvelle synchronisation", async () => {
    const { deps } = setup();
    const provider = await createProvider(deps);
    await syncProviderModels(deps, testActor, provider.id);
    const beta = await listProviderModels(deps, testActor, provider.id);
    const target = beta.find((model) => model.modelId === "Qwen/beta");
    expect(target).toBeDefined();
    await setProviderModelEnabled(deps, testActor, provider.id, target?.id ?? "", false);
    await syncProviderModels(deps, testActor, provider.id);
    const after = await listProviderModels(deps, testActor, provider.id);
    expect(after.find((model) => model.modelId === "Qwen/beta")?.enabled).toBe(false);
  });

  it("refuse un doublon manuel", async () => {
    const { deps } = setup();
    const provider = await createProvider(deps);
    await addManualProviderModel(deps, testActor, provider.id, { modelId: "manual/x" });
    await expect(
      addManualProviderModel(deps, testActor, provider.id, { modelId: "manual/x" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("définit un modèle actif comme défaut du fournisseur", async () => {
    const { deps } = setup();
    const provider = await createProvider(deps);
    await syncProviderModels(deps, testActor, provider.id);
    const updated = await setProviderDefaultModel(deps, testActor, provider.id, {
      modelId: "Qwen/alpha",
    });
    expect(updated.defaultModel).toBe("Qwen/alpha");
    await expect(
      setProviderDefaultModel(deps, testActor, provider.id, { modelId: "unknown" }),
    ).rejects.toThrow();
  });

  it("refuse de désactiver ou supprimer le défaut du fournisseur", async () => {
    const { deps } = setup();
    const provider = await createProvider(deps);
    await syncProviderModels(deps, testActor, provider.id);
    await setProviderDefaultModel(deps, testActor, provider.id, { modelId: "Qwen/alpha" });
    const models = await listProviderModels(deps, testActor, provider.id);
    const alpha = models.find((model) => model.modelId === "Qwen/alpha");
    expect(alpha).toBeDefined();
    await expect(
      setProviderModelEnabled(deps, testActor, provider.id, alpha?.id ?? "", false),
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      removeProviderModel(deps, testActor, provider.id, alpha?.id ?? ""),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("teste réellement un modèle via la factory", async () => {
    const { deps } = setup();
    const provider = await createProvider(deps);
    await syncProviderModels(deps, testActor, provider.id);
    const models = await listProviderModels(deps, testActor, provider.id);
    const alpha = models.find((model) => model.modelId === "Qwen/alpha");
    expect(alpha).toBeDefined();
    const withAi = {
      ...deps,
      aiFactory: fixedAiClientFactory({
        complete: async () => "OK",
      }),
    };
    await expect(
      testProviderModel(withAi, testActor, provider.id, alpha?.id ?? "", {}),
    ).resolves.toMatchObject({ ok: true, response: "OK" });
    await expect(
      testProviderModel(withAi, testActor, provider.id, alpha?.id ?? "", {
        messages: [{ role: "user", content: "Bonjour" }],
      }),
    ).resolves.toMatchObject({ ok: true, response: "OK" });
  });

  it("refuse de supprimer un modèle utilisé par un lien", async () => {
    const { deps, models } = setup();
    const provider = await createProvider(deps);
    await syncProviderModels(deps, testActor, provider.id);
    const all = await listProviderModels(deps, testActor, provider.id);
    const alpha = all.find((model) => model.modelId === "Qwen/alpha");
    expect(alpha).toBeDefined();
    models.setLinksUsing("Qwen/alpha", 1);
    await expect(
      removeProviderModel(deps, testActor, provider.id, alpha?.id ?? ""),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
