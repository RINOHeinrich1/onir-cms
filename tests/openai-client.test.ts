import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletionForProvider } from "@/infrastructure/ai/openai-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function completion(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
      usage: { completion_tokens: 12, completion_tokens_details: { reasoning_tokens: 0 } },
    }),
    { status: 200 },
  );
}

const messages = [{ role: "user" as const, content: "Bonjour" }];

describe("openai-client — dialectes", () => {
  it("envoie une requête OpenAI standard sans chat_template_kwargs", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => completion("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const answer = await chatCompletionForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      dialect: "openai",
      messages,
      maxTokens: 50,
    });
    expect(answer).toBe("ok");
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body.max_tokens).toBe(50);
    expect(body.chat_template_kwargs).toBeUndefined();
    expect(String(init?.headers)).not.toContain("secret");
  });

  it("désactive le thinking Qwen en dialecte Infomaniak", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => completion("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await chatCompletionForProvider({
      baseUrl: "https://api.infomaniak.com/2/ai/p/openai/v1",
      apiKey: "secret",
      model: "Qwen/Qwen3.5-122B-A10B-FP8",
      dialect: "infomaniak",
      messages,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.chat_template_kwargs).toEqual({ enable_thinking: false });
  });

  it("ne désactive pas le thinking Qwen sur un autre fournisseur", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => completion("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await chatCompletionForProvider({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "secret",
      model: "qwen/qwen3.5",
      dialect: "openai",
      messages,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.chat_template_kwargs).toBeUndefined();
  });

  it("retente avec max_completion_tokens si OpenAI refuse max_tokens", async () => {
    const fetchMock = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response('{"error":"Unsupported parameter: max_tokens"}', { status: 400 }),
      )
      .mockResolvedValueOnce(completion("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await chatCompletionForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-5",
      dialect: "openai",
      messages,
    });
    const secondCall = fetchMock.mock.calls[1] as unknown as [string, RequestInit] | undefined;
    const second = JSON.parse(String(secondCall?.[1]?.body)) as Record<string, unknown>;
    expect(second.max_completion_tokens).toBe(700);
    expect(second.max_tokens).toBeUndefined();
  });

  it("refuse une réponse vide", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => completion("   ")),
    );
    await expect(
      chatCompletionForProvider({
        baseUrl: "https://api.openai.com/v1",
        apiKey: "secret",
        model: "gpt-4o-mini",
        dialect: "openai",
        messages,
      }),
    ).rejects.toThrow("Réponse IA vide");
  });
});
