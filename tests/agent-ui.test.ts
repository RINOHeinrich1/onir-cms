import { describe, expect, it } from "vitest";
import {
  assistantResultMessage,
  cancelledMessage,
  conversationHistory,
  inconsistentMessage,
} from "@/components/agent-poc/agent-ui";

describe("messages conversationnels de l’agent", () => {
  it("annonce un succès sans jargon technique", () => {
    const message = assistantResultMessage(
      {
        status: "success",
        values: {},
        observation: {
          revision: 1,
          stateHash: "x",
          counts: { pages: 0, regions: 0, blocks: 0, placements: 0, actions: 0, styles: 0 },
          pages: [],
          blocks: [],
          placements: [],
          actions: [],
          styles: [],
          render: { revision: 1, text: "", header: "", main: "" },
        },
        attempts: 1,
        lastAttempt: null,
      },
      "changer le titre",
    );
    expect(message).toContain("C’est fait");
    expect(message).not.toContain("INVALID_");
  });

  it("ne prétend pas réussir en cas de blocage", () => {
    const message = assistantResultMessage(
      {
        status: "blocked",
        reason: "INVALID_CANDIDATE_ID steps.x.parent : Parent candidat inconnu.",
        values: {},
        observation: {
          revision: 1,
          stateHash: "x",
          counts: { pages: 0, regions: 0, blocks: 0, placements: 0, actions: 0, styles: 0 },
          pages: [],
          blocks: [],
          placements: [],
          actions: [],
          styles: [],
          render: { revision: 1, text: "", header: "", main: "" },
        },
        attempts: 1,
        lastAttempt: null,
      },
      "changer le titre",
    );
    expect(message).toContain("Je n’ai pas pu");
    expect(message).not.toContain("C’est fait");
    expect(message).not.toContain("INVALID_");
  });

  it("ne transmet que les messages conversationnels à l’historique", () => {
    expect(
      conversationHistory([
        { id: "1", role: "user", content: "ajoute une page Services", at: "x" },
        {
          id: "2",
          role: "assistant",
          content: "Je vérifie la demande.",
          at: "x",
          trace: [{ phase: "action", title: "Interne", status: "success" }],
        },
        { id: "3", role: "assistant", content: "   ", at: "x" },
      ]),
    ).toEqual([
      { role: "user", content: "ajoute une page Services" },
      { role: "assistant", content: "Je vérifie la demande." },
    ]);
  });

  it("explique une annulation et une incohérence sans publier", () => {
    expect(cancelledMessage()).toContain("annulé");
    expect(inconsistentMessage("storage down")).toContain("cohérent");
  });
});
