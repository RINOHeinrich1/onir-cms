import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { planFicheSearch } from "@/application/use-cases/fiches/plan-fiche-search";
import type { ChatMessage } from "@/domain/entities/chat";
import type { FicheSearchToolConfig } from "@/domain/fiche-search-tool";
import type { SearchableFicheDefinition } from "@/domain/fiche-search-validation";

const DEFINITIONS: SearchableFicheDefinition[] = [
  {
    key: "hotel",
    label: "Hôtel",
    fields: [
      { name: "localisation_principale", label: "Localisation", type: "text", required: false },
      { name: "services", label: "Services", type: "multi", required: false, options: ["Piscine"] },
    ],
  },
];

const CONFIG: FicheSearchToolConfig = {
  enabled: true,
  ficheTypes: ["hotel"],
  statusMode: "hidden_fixed",
  fixedStatusKeys: [],
  sortMode: "fair_rotation",
};

const HISTORY: ChatMessage[] = [
  {
    id: "u1",
    conversationId: "c1",
    role: "user",
    content: "Je cherche un hôtel à Mada",
    medias: [],
    mediasComputed: true,
    blocks: [],
    authorUserId: null,
    authorName: null,
    attachments: [],
    createdAt: new Date(0).toISOString(),
  },
];

function aiReturning(content: string): AiClient {
  return { complete: async () => content };
}

describe("SearchPlan — source fiches", () => {
  it("transforme une ville en condition structurée", async () => {
    const result = await planFicheSearch({
      ai: aiReturning(
        JSON.stringify({
          query: "",
          conditions: [
            {
              field: "localisation_principale",
              operator: "contains",
              value: "Anosibe",
            },
          ],
          limit: 5,
        }),
      ),
      recordUsage: async () => undefined,
      message: "Anosibe",
      history: HISTORY,
      config: CONFIG,
      definitions: DEFINITIONS,
    });
    expect(result.request?.conditions).toEqual([
      { field: "localisation_principale", operator: "contains", value: "Anosibe" },
    ]);
    expect(result.request?.query).toBeNull();
    expect(result.fallback).toBe(false);
  });

  it("n'envoie jamais « Oui » comme query", async () => {
    const result = await planFicheSearch({
      ai: aiReturning(JSON.stringify({ query: "Oui", conditions: [], limit: 5 })),
      recordUsage: async () => undefined,
      message: "Oui",
      history: HISTORY,
      config: CONFIG,
      definitions: DEFINITIONS,
    });
    expect(result.request?.query).toBeNull();
    expect(result.request?.conditions).toEqual([]);
    expect(result.fallback).toBe(true);
  });

  it("ignore une query conversationnelle même avec des conditions", async () => {
    const result = await planFicheSearch({
      ai: aiReturning(
        JSON.stringify({
          query: "Oui, je cherche un hôtel",
          conditions: [
            { field: "localisation_principale", operator: "contains", value: "Anosibe" },
          ],
        }),
      ),
      recordUsage: async () => undefined,
      message: "Oui",
      history: HISTORY,
      config: CONFIG,
      definitions: DEFINITIONS,
    });
    expect(result.request?.query).toBeNull();
    expect(result.request?.conditions).toHaveLength(1);
  });

  it("retombe sur une recherche large si le champ est inconnu", async () => {
    const result = await planFicheSearch({
      ai: aiReturning(
        JSON.stringify({
          conditions: [{ field: "inconnu", operator: "contains", value: "x" }],
        }),
      ),
      recordUsage: async () => undefined,
      message: "x",
      history: HISTORY,
      config: CONFIG,
      definitions: DEFINITIONS,
    });
    expect(result.request?.conditions).toEqual([]);
    expect(result.request?.query).toBeNull();
    expect(result.fallback).toBe(true);
  });
});
