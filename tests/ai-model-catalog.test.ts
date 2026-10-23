import { afterEach, describe, expect, it, vi } from "vitest";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ai-model-catalog — /models", () => {
  it("liste et trie les modèles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ data: [{ id: "z-model" }, { id: "a-model" }, { id: "a-model" }] }),
            {
              status: 200,
            },
          ),
      ),
    );
    const result = await openAiModelCatalog.listModels({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      cacheKey: `test-${Date.now()}`,
    });
    expect(result.models).toEqual(["a-model", "z-model"]);
    expect(result.modelsAvailable).toBe(true);
  });

  it("met en cache avec la clé fournie", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ data: [{ id: "cached" }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const target = {
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
      cacheKey: `cache-${Date.now()}`,
    };
    await openAiModelCatalog.listModels(target);
    await openAiModelCatalog.listModels(target);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalise une erreur 401 sans exposer la clé", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 })),
    );
    const result = await openAiModelCatalog.testConnection({
      baseUrl: "https://api.example.com/v1",
      apiKey: "super-secret-key",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toBe("Clé API refusée");
    expect(result.error).not.toContain("super-secret-key");
  });

  it("gère un timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        const error = new Error("timed out");
        error.name = "TimeoutError";
        throw error;
      }),
    );
    const result = await openAiModelCatalog.testConnection({
      baseUrl: "https://api.example.com/v1",
      apiKey: "secret",
    });
    expect(result.ok).toBe(false);
    expect(result.error.toLowerCase()).toContain("délai");
  });
});
