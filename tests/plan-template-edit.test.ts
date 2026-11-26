import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import { planTemplateEdit } from "@/application/use-cases/visual-templates/plan-template-edit";
import { collectTemplateEditCandidates } from "@/domain/template-edit-resolver";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

const ADMIN = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function sequenceAi(responses: string[]): AiClient {
  let index = 0;
  return {
    complete: async () => {
      const response = responses[index] ?? responses[responses.length - 1] ?? "{}";
      index += 1;
      return response;
    },
  };
}

function input(request: string) {
  return {
    request,
    page: null,
    candidates: collectTemplateEditCandidates({
      request,
      currentPageId: null,
      editor: puzzleV2Editor,
      values: puzzleV2Values,
    }),
    editor: puzzleV2Editor,
    schema: puzzleV2Params,
    values: puzzleV2Values,
    skills: [],
  };
}

describe("planner d’édition avec retry borné", () => {
  it("retente après une étape invalide et retourne un plan valide", async () => {
    const result = await planTemplateEdit(
      {
        aiFactory: fixedAiClientFactory(
          sequenceAi([
            JSON.stringify({
              steps: [
                {
                  id: "bad",
                  operation: {
                    op: "set",
                    target: {
                      kind: "collectionItemField",
                      collection: "blocks",
                      itemKey: "id",
                      itemId: "ghost",
                      field: "title",
                    },
                    value: "x",
                  },
                },
              ],
              warnings: [],
              clarification: null,
            }),
            JSON.stringify({
              steps: [
                {
                  id: "good",
                  operation: {
                    op: "set",
                    target: {
                      kind: "collectionItemField",
                      collection: "blocks",
                      itemKey: "id",
                      itemId: "card_one",
                      field: "title",
                    },
                    value: "Titre corrigé",
                  },
                },
              ],
              warnings: [],
              clarification: null,
            }),
          ]),
        ),
      },
      ADMIN,
      input("change le titre de la carte"),
    );

    expect(result.status).toBe("proposed");
    if (result.status !== "proposed") return;
    expect(result.attempts).toBe(2);
    expect(result.proposal.operations).toHaveLength(1);
  });

  it("traite un warning sans opérations comme une clarification", async () => {
    const result = await planTemplateEdit(
      {
        aiFactory: fixedAiClientFactory(
          sequenceAi([
            JSON.stringify({
              steps: [],
              warnings: ["Je ne trouve pas l’élément de menu demandé."],
              clarification: null,
            }),
          ]),
        ),
      },
      ADMIN,
      input("rattache la page au menu"),
    );

    expect(result.status).toBe("clarification");
    if (result.status !== "clarification") return;
    expect(result.message).toContain("élément de menu");
  });
});
