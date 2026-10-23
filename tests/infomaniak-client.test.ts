import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletion } from "@/infrastructure/ai/infomaniak-client";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.unstubAllEnvs();
});

function stubEnv(): void {
  vi.stubEnv("AI_API_TOKEN", "token-test");
  vi.stubEnv("AI_PRODUCT_ID", "00000");
  vi.stubEnv("AI_MODEL", "modele-test");
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}

describe("infomaniak-client — RM-IA-001 (fetch mocké, aucun appel réseau)", () => {
  it("envoie model + messages et renvoie le contenu", async () => {
    stubEnv();
    const fetchMock = vi.fn(
      async (_url: string, _init?: RequestInit): Promise<Response> =>
        jsonResponse({ choices: [{ message: { content: "Bonjour" } }] }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const answer = await chatCompletion({
      model: "modele-test",
      messages: [{ role: "user", content: "Salut" }],
    });
    expect(answer).toBe("Bonjour");
    expect(fetchMock).toHaveBeenCalledOnce();
    const firstCall = fetchMock.mock.calls[0];
    expect(firstCall).toBeDefined();
    const [url, init] = firstCall as unknown as [string, RequestInit];
    expect(url).toContain("/2/ai/00000/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer token-test");
  });

  it("signale une erreur HTTP sans fuir le token", async () => {
    stubEnv();
    globalThis.fetch = (async () => new Response("{}", { status: 503 })) as unknown as typeof fetch;
    await expect(
      chatCompletion({ model: "modele-test", messages: [{ role: "user", content: "Salut" }] }),
    ).rejects.toThrow("HTTP 503");
  });

  it("refuse une réponse vide", async () => {
    stubEnv();
    globalThis.fetch = (async () =>
      jsonResponse({ choices: [{ message: { content: "  " } }] })) as unknown as typeof fetch;
    await expect(
      chatCompletion({ model: "modele-test", messages: [{ role: "user", content: "Salut" }] }),
    ).rejects.toThrow("vide");
  });
});
