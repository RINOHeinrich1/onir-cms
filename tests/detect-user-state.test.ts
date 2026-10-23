import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { detectUserState } from "@/application/use-cases/chat/detect-user-state";

const NEUTRAL = { state: "neutral", confidence: 0 } as const;

function aiReturning(value: string): AiClient {
  return { complete: vi.fn(async () => value) };
}

describe("detectUserState — capacité cœur (ADR-0020)", () => {
  it("classe un remerciement en `content`", async () => {
    const ai = aiReturning('{"state":"content","confidence":0.9}');
    await expect(detectUserState({ ai }, { content: "Merci beaucoup !" })).resolves.toEqual({
      state: "content",
      confidence: 0.9,
    });
  });

  it("classe une déception en `triste`", async () => {
    const ai = aiReturning('{"state":"triste","confidence":0.7}');
    await expect(
      detectUserState({ ai }, { content: "Je suis vraiment déçu par ce retard." }),
    ).resolves.toEqual({ state: "triste", confidence: 0.7 });
  });

  it("classe une question neutre en `neutral`", async () => {
    const ai = aiReturning('{"state":"neutral","confidence":0.5}');
    await expect(detectUserState({ ai }, { content: "Quels sont vos tarifs ?" })).resolves.toEqual({
      state: "neutral",
      confidence: 0.5,
    });
  });

  it("borne la confiance à l'intervalle [0, 1]", async () => {
    const ai = aiReturning('{"state":"content","confidence":7}');
    const result = await detectUserState({ ai }, { content: "top" });
    expect(result.confidence).toBe(1);
  });

  it("fail-open si l'IA échoue (aucune exception levée)", async () => {
    const ai: AiClient = {
      complete: vi.fn(async () => {
        throw new Error("service indisponible");
      }),
    };
    await expect(detectUserState({ ai }, { content: "Bonjour" })).resolves.toEqual(NEUTRAL);
  });

  it("fail-open si la réponse n'est pas du JSON", async () => {
    const ai = aiReturning("je pense que le visiteur est content");
    await expect(detectUserState({ ai }, { content: "Bonjour" })).resolves.toEqual(NEUTRAL);
  });

  it("fail-open si l'état renvoyé est inconnu", async () => {
    const ai = aiReturning('{"state":"furieux","confidence":0.9}');
    await expect(detectUserState({ ai }, { content: "Bonjour" })).resolves.toEqual(NEUTRAL);
  });

  it("fail-open si la confiance est absente ou non numérique", async () => {
    await expect(
      detectUserState({ ai: aiReturning('{"state":"content"}') }, { content: "Bonjour" }),
    ).resolves.toEqual(NEUTRAL);
    await expect(
      detectUserState(
        { ai: aiReturning('{"state":"content","confidence":"fort"}') },
        { content: "Bonjour" },
      ),
    ).resolves.toEqual(NEUTRAL);
  });

  it("ne sollicite pas l'IA pour un contenu vide (neutre direct)", async () => {
    const complete = vi.fn(async () => '{"state":"content","confidence":1}');
    const ai: AiClient = { complete };
    await expect(detectUserState({ ai }, { content: "   " })).resolves.toEqual(NEUTRAL);
    expect(complete).not.toHaveBeenCalled();
  });

  it("transmet l'historique borné (rôles du chat uniquement)", async () => {
    const complete = vi.fn(async (_input: unknown) => '{"state":"neutral","confidence":0.1}');
    const ai: AiClient = { complete };
    const history = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `tour ${index}`,
    }));
    await detectUserState({ ai }, { content: "Question", history });
    const call = complete.mock.calls[0]?.[0] as { messages: { role: string; content: string }[] };
    // 6 tours d'historique max + le message courant.
    expect(call.messages).toHaveLength(7);
    expect(call.messages[call.messages.length - 1]).toEqual({
      role: "user",
      content: "Question",
    });
  });
});
