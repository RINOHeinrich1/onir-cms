import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatCompletionForProvider,
  chatCompletionWithToolsForProvider,
} from "@/infrastructure/ai/openai-client";

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

  it("remonte l'usage prompt/completion au callback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(
            JSON.stringify({
              choices: [{ message: { content: "ok" } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            }),
            { status: 200 },
          ),
      ),
    );
    let usage: unknown;
    await chatCompletionForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      dialect: "openai",
      messages,
      onUsage: (value) => {
        usage = value;
      },
    });
    expect(usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
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

describe("openai-client — tool calling natif (ADR-0067 §7.1)", () => {
  const tools = [
    {
      name: "search_fiches",
      description: "Recherche des fiches.",
      parameters: { type: "object", properties: {} },
    },
  ];

  it("envoie tools/tool_choice et parse les tool_calls", async () => {
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "call_1",
                      type: "function",
                      function: {
                        name: "search_fiches",
                        arguments: '{"ficheTypes":["maison"]}',
                      },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
            usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = await chatCompletionWithToolsForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      dialect: "openai",
      messages,
      tools,
    });
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search_fiches",
          description: "Recherche des fiches.",
          parameters: { type: "object", properties: {} },
        },
      },
    ]);
    expect(body.tool_choice).toBe("auto");
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "search_fiches", arguments: '{"ficheTypes":["maison"]}' },
    ]);
    expect(result.finishReason).toBe("tool_calls");
  });

  it("normalise des arguments objet et conserve le contenu final", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, _init: RequestInit) =>
          new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: "Réponse finale",
                    tool_calls: [
                      { id: "c2", function: { name: "search_fiches", arguments: { limit: 5 } } },
                    ],
                  },
                  finish_reason: "tool_calls",
                },
              ],
            }),
            { status: 200 },
          ),
      ),
    );
    const result = await chatCompletionWithToolsForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      dialect: "openai",
      messages,
      tools,
    });
    expect(result.content).toBe("Réponse finale");
    expect(result.toolCalls[0]?.arguments).toBe('{"limit":5}');
  });

  it("accepte une réponse vide si un outil est appelé, et n'envoie pas tools sans outils", async () => {
    const fetchMock = vi
      .fn<(url: string, init: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: null,
                  tool_calls: [{ id: "c", function: { name: "list", arguments: "{}" } }],
                },
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(completion("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await chatCompletionWithToolsForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      dialect: "openai",
      messages,
      tools,
    });
    expect(result.content).toBe("");
    expect(result.toolCalls).toHaveLength(1);

    await chatCompletionForProvider({
      baseUrl: "https://api.openai.com/v1",
      apiKey: "secret",
      model: "gpt-4o-mini",
      dialect: "openai",
      messages,
    });
    const second = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as Record<
      string,
      unknown
    >;
    expect(second.tools).toBeUndefined();
    expect(second.tool_choice).toBeUndefined();
  });
});
