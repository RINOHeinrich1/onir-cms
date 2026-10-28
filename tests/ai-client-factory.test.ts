import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAiProvider } from "@/application/use-cases/ai/manage-ai-providers";
import { createAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { memoryAiModelRepository } from "./helpers/ai-model-memory";
import { memoryAiProviderRepository, testActor } from "./helpers/ai-provider-memory";

const ORIGINAL_KEY = process.env.AI_PROVIDER_KEY;

beforeEach(() => {
  process.env.AI_PROVIDER_KEY = "a".repeat(64);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  if (ORIGINAL_KEY === undefined) delete process.env.AI_PROVIDER_KEY;
  else process.env.AI_PROVIDER_KEY = ORIGINAL_KEY;
});

describe("ai-client-factory — client construit", () => {
  it("déchiffre la clé, transmet le modèle et ne logue jamais la clé", async () => {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const deps = { providers: providers.repo, models: models.repo };
    const provider = await createAiProvider(deps, testActor, {
      label: "Infomaniak",
      preset: "infomaniak",
      productId: "42",
      apiKey: "secret-key-1234",
    });
    await models.repo.create("org-1", provider.id, {
      modelId: "Qwen/Qwen3.5",
      source: "manual",
      createdBy: null,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "ok" } }],
            usage: { completion_tokens: 3 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);

    const client = await createAiClientFactory(deps).forTarget({
      organizationId: "org-1",
      aiProviderId: provider.id,
      aiModel: "Qwen/Qwen3.5",
    });
    let usage: { completionTokens: number } | undefined;
    await expect(
      client.complete({
        system: "sys",
        messages: [{ role: "user", content: "hi" }],
        onUsage: (value) => {
          usage = value;
        },
      }),
    ).resolves.toBe("ok");
    expect(usage?.completionTokens).toBe(3);

    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
    expect(body.model).toBe("Qwen/Qwen3.5");
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
    const headers = (call?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer secret-key-1234");
    for (const call of log.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("secret-key-1234");
    }
  });

  it("construit un client legacy Infomaniak", async () => {
    process.env.AI_API_TOKEN = "legacy-token";
    process.env.AI_PRODUCT_ID = "42";
    process.env.AI_MODEL = "Qwen/Qwen3.5";
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ choices: [{ message: { content: "legacy" } }], usage: {} }), {
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = await createAiClientFactory({
      providers: providers.repo,
      models: models.repo,
    }).forTarget(null);
    await expect(
      client.complete({ system: "s", messages: [{ role: "user", content: "x" }] }),
    ).resolves.toBe("legacy");
    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    expect(String(call?.[0])).toContain("/2/ai/42/openai/v1/chat/completions");
  });
});

describe("ai-client-factory — raisonnement", () => {
  it("désactive le raisonnement Gemma lors d'une extraction", async () => {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const deps = { providers: providers.repo, models: models.repo };
    const provider = await createAiProvider(deps, testActor, {
      label: "Infomaniak",
      preset: "infomaniak",
      productId: "42",
      apiKey: "secret-key-1234",
    });
    await models.repo.create("org-1", provider.id, {
      modelId: "google/gemma-4-31B-it",
      source: "manual",
      createdBy: null,
    });
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"nom":"Acme"}' } }],
            usage: { completion_tokens: 4 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const client = await createAiClientFactory(deps).forTarget({
      organizationId: "org-1",
      aiProviderId: provider.id,
      aiModel: "google/gemma-4-31B-it",
    });
    await client.complete({
      system: "extrait",
      messages: [{ role: "user", content: "Acme" }],
      reasoning: "disabled",
      structured: true,
    });
    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const body = JSON.parse(String(call?.[1]?.body)) as Record<string, unknown>;
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });
});
