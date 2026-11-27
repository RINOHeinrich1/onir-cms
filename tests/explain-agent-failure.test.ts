import { describe, expect, it } from "vitest";
import type { AiCompletionInput } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import { explainAgentFailure } from "@/application/use-cases/visual-templates/agent-poc/explain-agent-failure";

describe("explication IA d’un échec", () => {
  it("transmet le contexte et renvoie une explication utilisateur", async () => {
    const calls: AiCompletionInput[] = [];
    const message = await explainAgentFailure(
      {
        aiFactory: fixedAiClientFactory({
          async complete(input) {
            calls.push(input);
            return "Le bouton visé n’a pas été retrouvé. Essaie de préciser le bouton exact.";
          },
        }),
      },
      {
        id: "user",
        role: "admin",
        organizationId: "org",
        isSuperAdmin: false,
      },
      {
        request: "colorie le bouton en rouge",
        reason: "INVALID_CANDIDATE_ID parent",
        trace: [
          {
            phase: "action",
            title: "Cible introuvable",
            status: "error",
            detail: "Le parent est inconnu.",
          },
        ],
        attempt: null,
        observation: {
          revision: 1,
          stateHash: "hash",
          counts: { pages: 1, regions: 1, blocks: 1, placements: 0, actions: 0, styles: 0 },
          pages: [],
          blocks: [],
          placements: [],
          actions: [],
          styles: [],
          render: { revision: 1, text: "", header: "", main: "" },
        },
      },
    );

    expect(message).toContain("bouton");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.system).toContain("Ne prétends jamais");
    expect(calls[0]?.messages[0]?.content).toContain("colorie le bouton en rouge");
    expect(calls[0]?.messages[0]?.content).toContain("Le parent est inconnu");
  });
});
