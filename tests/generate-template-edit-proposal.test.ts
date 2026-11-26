import { describe, expect, it } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import { generateTemplateEditProposal } from "@/application/use-cases/visual-templates/generate-template-edit-proposal";
import { resolveTemplateEditTarget } from "@/domain/template-edit-resolver";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

const ADMIN = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function aiReturning(content: string): AiClient {
  return { complete: async () => content };
}

describe("génération d'une proposition d'édition", () => {
  it("transforme une demande de suppression en proposition valide", async () => {
    const request = "supprime la carte Formation informatique";
    const resolved = resolveTemplateEditTarget({
      request,
      currentPageId: "home",
      editor: puzzleV2Editor,
      values: puzzleV2Values,
    });
    const candidate = resolved.candidates[0];
    expect(candidate).toBeDefined();
    if (candidate === undefined) return;

    const result = await generateTemplateEditProposal(
      {
        aiFactory: fixedAiClientFactory(
          aiReturning(
            JSON.stringify({
              operations: [
                {
                  op: "remove",
                  target: {
                    kind: "collectionItem",
                    collection: "blocks",
                    itemKey: "id",
                    itemId: "card_one",
                  },
                },
              ],
              warnings: [],
            }),
          ),
        ),
      },
      ADMIN,
      {
        request,
        page: resolved.page,
        candidate,
        editor: puzzleV2Editor,
        schema: puzzleV2Params,
        values: puzzleV2Values,
      },
    );

    expect(result.proposal.operations).toHaveLength(1);
    expect(
      (result.values.blocks as Array<Record<string, unknown>>).some(
        (item) => item.id === "card_one",
      ),
    ).toBe(false);
  });

  it("refuse une proposition mal formée", async () => {
    const request = "supprime la carte Formation informatique";
    const resolved = resolveTemplateEditTarget({
      request,
      currentPageId: "home",
      editor: puzzleV2Editor,
      values: puzzleV2Values,
    });
    const candidate = resolved.candidates[0];
    if (candidate === undefined) throw new Error("candidate manquante");

    await expect(
      generateTemplateEditProposal(
        { aiFactory: fixedAiClientFactory(aiReturning('{"operations":[]}')) },
        ADMIN,
        {
          request,
          page: resolved.page,
          candidate,
          editor: puzzleV2Editor,
          schema: puzzleV2Params,
          values: puzzleV2Values,
        },
      ),
    ).rejects.toThrow("exploitable");
  });
});
