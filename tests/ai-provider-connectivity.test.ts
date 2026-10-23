import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AiModelCatalog } from "@/application/ports/ai-model-catalog";
import {
  listAiProviderModels,
  testAiProvider,
} from "@/application/use-cases/ai/ai-provider-connectivity";
import { createAiProvider } from "@/application/use-cases/ai/manage-ai-providers";
import { memoryAiProviderRepository, testActor } from "./helpers/ai-provider-memory";

const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeEach(() => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

function catalog(): AiModelCatalog {
  return {
    async listModels() {
      return { models: ["m1", "m2"], modelsAvailable: true, latencyMs: 12 };
    },
    async testConnection() {
      return { ok: true, latencyMs: 12, modelsCount: 2, modelsAvailable: true, error: "" };
    },
  };
}

describe("ai-provider-connectivity", () => {
  it("teste un fournisseur et mémorise le résultat", async () => {
    const memory = memoryAiProviderRepository();
    const d = { providers: memory.repo, catalog: catalog() };
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    const result = await testAiProvider(d, testActor, created.id);
    expect(result.ok).toBe(true);
    expect(result.modelsCount).toBe(2);
    const refreshed = await memory.repo.findById("org-1", created.id);
    expect(refreshed?.lastTestOk).toBe(true);
  });

  it("liste les modèles", async () => {
    const memory = memoryAiProviderRepository();
    const d = { providers: memory.repo, catalog: catalog() };
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    await expect(listAiProviderModels(d, testActor, created.id)).resolves.toEqual({
      models: ["m1", "m2"],
      modelsAvailable: true,
    });
  });

  it("échoue proprement si la clé maîtresse ne déchiffre pas", async () => {
    const memory = memoryAiProviderRepository();
    const d = { providers: memory.repo, catalog: catalog() };
    const created = await createAiProvider(d, testActor, {
      label: "OpenAI",
      preset: "openai",
      apiKey: "sk-123456",
    });
    process.env.AI_PROVIDER_KEY = "b".repeat(64);
    await expect(testAiProvider(d, testActor, created.id)).rejects.toThrow("illisible");
  });
});
