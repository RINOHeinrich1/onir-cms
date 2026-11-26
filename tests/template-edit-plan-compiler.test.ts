import { describe, expect, it } from "vitest";
import { compileTemplateEditPlan } from "@/domain/template-edit-plan-compiler";
import { collectTemplateEditCandidates } from "@/domain/template-edit-resolver";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

function candidates(request: string) {
  return collectTemplateEditCandidates({
    request,
    currentPageId: "home",
    editor: puzzleV2Editor,
    values: puzzleV2Values,
  });
}

function input(request: string, plan: unknown) {
  return {
    plan,
    editor: puzzleV2Editor,
    schema: puzzleV2Params,
    candidates: candidates(request),
  };
}

function codes(result: ReturnType<typeof compileTemplateEditPlan>): string[] {
  return result.ok ? [] : result.errors.map((error) => error.code);
}

describe("compilateur du Plan DSL", () => {
  it("compile un candidat existant et une référence $ref", () => {
    const result = compileTemplateEditPlan(
      input("attache un style à la carte", {
        schemaVersion: 1,
        intent: "update",
        steps: [
          {
            id: "style",
            operation: {
              op: "insert",
              target: { kind: "collection", collection: "style_profiles" },
              values: { name: "Style local" },
            },
          },
          {
            id: "attach",
            operation: {
              op: "set",
              candidateId: "blocks:card_one",
              field: "style_id",
              value: { $ref: "style" },
            },
          },
        ],
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.intent).toBe("update");
    expect(result.value.plan.steps[1]?.operation).toMatchObject({
      op: "set",
      target: {
        kind: "collectionItemField",
        collection: "blocks",
        itemId: "card_one",
      },
      value: "$ref:style",
    });
  });

  it("refuse une référence de mauvaise collection", () => {
    const result = compileTemplateEditPlan(
      input("change le style de la carte", {
        schemaVersion: 1,
        steps: [
          {
            id: "bad",
            operation: {
              op: "set",
              candidateId: "blocks:card_one",
              field: "style_id",
              value: { $candidate: "pages:home" },
            },
          },
        ],
      }),
    );
    expect(codes(result)).toContain("INVALID_REFERENCE_TYPE");
  });

  it("refuse un champ inconnu", () => {
    const result = compileTemplateEditPlan(
      input("change la carte", {
        schemaVersion: 1,
        steps: [
          {
            id: "bad",
            operation: {
              op: "set",
              candidateId: "blocks:card_one",
              field: "unknown_field",
              value: "x",
            },
          },
        ],
      }),
    );
    expect(codes(result)).toContain("INVALID_FIELD");
  });

  it("refuse une cible de set non structurée", () => {
    const result = compileTemplateEditPlan(
      input("change la carte", {
        schemaVersion: 1,
        steps: [
          {
            id: "bad",
            operation: {
              op: "set",
              target: "blocks:card_one",
              value: "x",
            },
          },
        ],
      }),
    );
    expect(codes(result)).toContain("INVALID_TARGET_KIND");
  });
});
