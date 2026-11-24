import { describe, expect, it } from "vitest";
import {
  validateTemplateEditorCollectionValues,
  validateTemplateEditorStructureValues,
} from "@/domain/template-editor";
import {
  addCollectionChildItem,
  addCollectionItem,
  duplicateCollectionItem,
  removeCollectionItem,
} from "@/domain/template-structure-operations";
import { puzzleV2Editor, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

function values() {
  return JSON.parse(JSON.stringify(puzzleV2Values)) as typeof puzzleV2Values;
}

describe("opérations structurelles Editor V2", () => {
  it("ajoute un composant avec un identifiant généré et un placement", () => {
    const source = values();
    const base = {
      kind: "card",
      name: "Nouvelle carte",
      title: "Nouvelle carte",
      description: "",
      style_id: "profile_main",
      action_id: "action_scroll",
    };
    const result = addCollectionItem(source, puzzleV2Editor, "blocks", base, "card_one");
    expect(result.itemId).not.toBeNull();
    expect(result.values.blocks).toHaveLength(5);
    expect(result.values.placements).toHaveLength(3);
    expect(
      (result.values.blocks as Array<Record<string, unknown>>).some(
        (item) => item.id === result.itemId,
      ),
    ).toBe(true);
    expect(validateTemplateEditorCollectionValues(puzzleV2Editor, result.values)).toEqual([]);
    expect(validateTemplateEditorStructureValues(puzzleV2Editor, result.values)).toEqual([]);
  });

  it("duplique un composant avec une nouvelle identité et ses placements", () => {
    const result = duplicateCollectionItem(values(), puzzleV2Editor, "blocks", "card_one");
    expect(result.itemId).not.toBeNull();
    expect(result.values.blocks).toHaveLength(5);
    expect(
      (result.values.placements as Array<Record<string, unknown>>).some(
        (placement) => placement.child_id === result.itemId,
      ),
    ).toBe(true);
    expect(validateTemplateEditorCollectionValues(puzzleV2Editor, result.values)).toEqual([]);
  });

  it("supprime un composant et ses placements", () => {
    const result = removeCollectionItem(values(), puzzleV2Editor, "blocks", "card_one");
    expect(
      (result.blocks as Array<Record<string, unknown>>).some((item) => item.id === "card_one"),
    ).toBe(false);
    expect(
      (result.placements as Array<Record<string, unknown>>).some(
        (placement) => placement.child_id === "card_one",
      ),
    ).toBe(false);
  });
});

describe("insertion typée", () => {
  it("ajoute un menu_item sous le menu avec le bon placement", () => {
    const rule = puzzleV2Editor.insertion?.[0];
    expect(rule).toBeDefined();
    if (rule === undefined) return;
    const result = addCollectionChildItem(values(), puzzleV2Editor, rule, "nav_main", {
      kind: "menu_item",
      title: "Contact",
    });
    expect(result.itemId).not.toBeNull();
    expect(
      (result.values.placements as Array<Record<string, unknown>>).some(
        (placement) =>
          placement.child_id === result.itemId &&
          placement.parent_id === "nav_main" &&
          placement.slot === "content",
      ),
    ).toBe(true);
    expect(validateTemplateEditorStructureValues(puzzleV2Editor, result.values)).toEqual([]);
  });
});
