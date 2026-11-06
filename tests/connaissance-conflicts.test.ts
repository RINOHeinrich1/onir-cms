import { describe, expect, it, vi } from "vitest";
import { resolveConnaissanceConflicts } from "@/application/use-cases/connaissances/resolve-connaissance-conflicts";
import type { ChatLink } from "@/domain/entities/chat";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function link(id: string, label: string, connaissances = true): ChatLink {
  return { id, label, sources: { connaissances, phototheque: false, lien: false } } as ChatLink;
}

function config(
  id: string,
  enabled: boolean,
  mode: "all" | "selected",
  ids: string[] = [],
): ChatbotConfig {
  return {
    chatLinkId: id,
    dataSelection: { mode, connaissanceIds: ids, mediaIds: [] },
    informationSources: {
      connaissances: { enabled, selection: { mode, ids }, maxEntries: 40 },
    },
  } as unknown as ChatbotConfig;
}

describe("conflits de connaissances", () => {
  it("retourne les chatbots qui consomment une connaissance globale", async () => {
    const result = await resolveConnaissanceConflicts(
      {
        connaissances: {
          findByTitre: vi.fn(async () => ({
            id: "k1",
            titre: "Horaires",
            contenu: "9h–18h",
            chatLinkIds: [],
          })),
        } as never,
        links: {
          list: vi.fn(async () => [link("l1", "Alpha"), link("l2", "Beta")]),
        } as never,
        configs: {
          currentForLink: vi.fn(async (_org, id) =>
            id === "l1" ? config("l1", true, "all") : config("l2", false, "all"),
          ),
        } as never,
      },
      ACTOR,
      { items: [{ titre: "Horaires" }] },
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.affectedChatbots).toEqual([{ id: "l1", label: "Alpha" }]);
    expect(result[0]?.existingChatLinkIds).toEqual([]);
  });

  it("retourne les chatbots scopés et ceux qui sélectionnent une globale", async () => {
    const result = await resolveConnaissanceConflicts(
      {
        connaissances: {
          findByTitre: vi.fn(async () => ({
            id: "k2",
            titre: "Services",
            contenu: "Conseil et digital",
            chatLinkIds: ["l2"],
          })),
        } as never,
        links: {
          list: vi.fn(async () => [link("l1", "Alpha"), link("l2", "Beta")]),
        } as never,
        configs: {
          currentForLink: vi.fn(async (_org, id) =>
            id === "l1" ? config("l1", true, "selected", ["k2"]) : config("l2", true, "all"),
          ),
        } as never,
      },
      ACTOR,
      { items: [{ titre: "Services" }] },
    );

    expect(result[0]?.existingChatLinkIds).toEqual(["l2"]);
    expect(result[0]?.affectedChatbots).toEqual([{ id: "l2", label: "Beta" }]);
  });
});
