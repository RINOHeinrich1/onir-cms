import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { analyzeChatbotIntent } from "@/application/use-cases/chat/intent-analysis";
import {
  type ChatbotInformationSources,
  defaultChatbotInformationSources,
} from "@/domain/entities/chatbot-information";

function sources(): ChatbotInformationSources {
  const value = defaultChatbotInformationSources();
  value.connaissances.enabled = true;
  value.medias.enabled = true;
  return value;
}

function aiReturning(content: string): AiClient {
  return { complete: async () => content };
}

const input = {
  message: "Donne-moi le contact de MandamPro et des hôtels à Mada",
  history: [],
  mission: "inform" as const,
  sources: sources(),
  allowedSources: ["connaissances", "fiches"] as const,
  collectionActive: false,
};

describe("analyse d'intention", () => {
  it("route une demande mixte vers deux sources", async () => {
    const result = await analyzeChatbotIntent({
      ...input,
      allowedSources: ["connaissances", "fiches"],
      ai: aiReturning(
        JSON.stringify({
          intent: "inform",
          confidence: 0.95,
          needsSources: true,
          sources: [
            { source: "connaissances", query: "contact MandamPro" },
            { source: "fiches", query: "hôtels Madagascar", limit: 5 },
          ],
        }),
      ),
    });
    expect(result.intent).toBe("inform");
    expect(result.sources).toEqual([
      { source: "connaissances", query: "contact MandamPro" },
      { source: "fiches", query: "hôtels Madagascar", limit: 5 },
    ]);
  });

  it("ignore une source non active", async () => {
    const result = await analyzeChatbotIntent({
      ...input,
      allowedSources: ["connaissances"],
      ai: aiReturning(
        JSON.stringify({
          intent: "inform",
          confidence: 0.8,
          needsSources: true,
          sources: [{ source: "fiches", query: "x" }],
        }),
      ),
    });
    expect(result.intent).toBe("clarify");
    expect(result.sources).toEqual([]);
  });

  it("nettoie les sources si needsSources=false", async () => {
    const result = await analyzeChatbotIntent({
      ...input,
      allowedSources: ["connaissances"],
      ai: aiReturning(
        JSON.stringify({
          intent: "inform",
          confidence: 0.9,
          needsSources: false,
          sources: [{ source: "connaissances", query: "x" }],
        }),
      ),
    });
    expect(result.intent).toBe("inform");
    expect(result.sources).toEqual([]);
  });

  it("refuse collect quand la mission est inform", async () => {
    const result = await analyzeChatbotIntent({
      ...input,
      allowedSources: ["connaissances"],
      ai: aiReturning(
        JSON.stringify({
          intent: "collect",
          confidence: 0.99,
          needsSources: false,
          sources: [],
        }),
      ),
    });
    expect(result.intent).toBe("clarify");
  });

  it("retombe sur les sources actives si le JSON est invalide", async () => {
    const result = await analyzeChatbotIntent({
      ...input,
      allowedSources: ["connaissances"],
      ai: aiReturning("pas du json"),
    });
    expect(result.fallback).toBe(true);
    expect(result.sources).toEqual([{ source: "connaissances", query: input.message }]);
  });
});
