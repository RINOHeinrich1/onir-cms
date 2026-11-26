import { describe, expect, it } from "vitest";
import type { TemplateEditPlan } from "@/domain/template-edit-plan";
import { executeTemplateEditPlan } from "@/domain/template-edit-plan";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

function values() {
  return JSON.parse(JSON.stringify(puzzleV2Values)) as typeof puzzleV2Values;
}

describe("exécution d’un plan avec références symboliques", () => {
  it("crée une page, une action et une entrée de menu liées", () => {
    const plan: TemplateEditPlan = {
      steps: [
        {
          id: "page",
          operation: {
            op: "insert",
            target: { kind: "collection", collection: "pages" },
            values: { slug: "services-test", title: "Services test" },
          },
        },
        {
          id: "action",
          operation: {
            op: "insert",
            target: { kind: "collection", collection: "actions" },
            values: { kind: "navigate_page", target_id: "$ref:page" },
          },
        },
        {
          id: "menu",
          operation: {
            op: "insertChild",
            parent: {
              kind: "collectionItem",
              collection: "blocks",
              itemKey: "id",
              itemId: "nav_main",
              itemKind: "menu",
            },
            child: {
              collection: "blocks",
              kind: "menu_item",
              slot: "content",
              values: { title: "Services test", action_id: "$ref:action" },
            },
          },
        },
      ],
    };
    const result = executeTemplateEditPlan({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      plan,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const page = (result.values.pages as Array<Record<string, unknown>>).find(
      (item) => item.id === result.refs.page,
    );
    const action = (result.values.actions as Array<Record<string, unknown>>).find(
      (item) => item.id === result.refs.action,
    );
    const menu = (result.values.blocks as Array<Record<string, unknown>>).find(
      (item) => item.id === result.refs.menu,
    );
    expect(page?.title).toBe("Services test");
    expect(action?.target_id).toBe(result.refs.page);
    expect(menu?.action_id).toBe(result.refs.action);
    const placement = (result.values.placements as Array<Record<string, unknown>>).find(
      (item) => item.child_id === result.refs.menu,
    );
    expect(placement?.parent_id).toBe("nav_main");
  });

  it("échoue proprement sur une référence inconnue", () => {
    const result = executeTemplateEditPlan({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      plan: {
        steps: [
          {
            id: "bad",
            operation: {
              op: "set",
              target: {
                kind: "collectionItemField",
                collection: "blocks",
                itemKey: "id",
                itemId: "$ref:inconnu",
                field: "title",
              },
              value: "x",
            },
          },
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]).toContain("Référence de plan inconnue");
  });
});
