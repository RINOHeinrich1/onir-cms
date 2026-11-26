import { describe, expect, it } from "vitest";
import {
  applyTemplateEditProposal,
  type TemplateEditProposal,
  validateTemplateEditProposal,
} from "@/domain/template-edit-proposal";
import { puzzleV2Editor, puzzleV2Params, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

function values() {
  return JSON.parse(JSON.stringify(puzzleV2Values)) as typeof puzzleV2Values;
}

function proposal(operations: TemplateEditProposal["operations"]): TemplateEditProposal {
  return { operations };
}

const pageEditor = {
  ...puzzleV2Editor,
  insertion: [
    ...(puzzleV2Editor.insertion ?? []),
    {
      parentKind: "page",
      childCollection: "blocks",
      allowedKinds: ["card"],
      slot: "main",
    },
  ],
};

const cardOne = {
  kind: "collectionItem",
  collection: "blocks",
  itemKey: "id",
  itemId: "card_one",
  itemKind: "card",
} as const;

describe("application générique d'une proposition d'édition", () => {
  it("applique un set sur un paramètre imbriqué", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "set",
          target: { kind: "param", path: "global_theme.color_primary" },
          value: "#112233",
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect((result.values.global_theme as Record<string, unknown>).color_primary).toBe("#112233");
  });

  it("applique un set sur un champ d'élément", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "set",
          target: {
            kind: "collectionItemField",
            collection: "blocks",
            itemKey: "id",
            itemId: "card_one",
            field: "title",
          },
          value: "Discuter avec nous",
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const block = (result.values.blocks as Array<Record<string, unknown>>).find(
      (item) => item.id === "card_one",
    );
    expect(block?.title).toBe("Discuter avec nous");
  });

  it("insère un enfant typé via une règle d'insertion", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
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
            values: { title: "Contact" },
          },
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.itemIds).toHaveLength(1);
    const childId = result.itemIds[0];
    const placement = (result.values.placements as Array<Record<string, unknown>>).find(
      (item) => item.child_id === childId,
    );
    expect(placement?.parent_id).toBe("nav_main");
    expect(placement?.parent_kind).toBe("block");
    expect(placement?.slot).toBe("content");
  });

  it("insère un bloc à la racine d'une page quand la règle existe", () => {
    const result = applyTemplateEditProposal({
      editor: pageEditor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "insertChild",
          parent: {
            kind: "page",
            collection: "pages",
            itemKey: "id",
            itemId: "home",
          },
          child: {
            collection: "blocks",
            kind: "card",
            slot: "main",
            values: { title: "Nouvelle carte" },
          },
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const childId = result.itemIds[0];
    const placement = (result.values.placements as Array<Record<string, unknown>>).find(
      (item) => item.child_id === childId,
    );
    expect(placement?.parent_id).toBe("home");
    expect(placement?.parent_kind).toBe("page");
    expect(placement?.slot).toBe("main");
  });

  it("supprime un élément et ses placements", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "remove",
          target: {
            kind: "collectionItem",
            collection: "blocks",
            itemKey: "id",
            itemId: "card_two",
            itemKind: "card",
          },
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      (result.values.blocks as Array<Record<string, unknown>>).some(
        (item) => item.id === "card_two",
      ),
    ).toBe(false);
    expect(
      (result.values.placements as Array<Record<string, unknown>>).some(
        (item) => item.child_id === "card_two",
      ),
    ).toBe(false);
  });

  it("déplace un élément sous un autre parent", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "move",
          target: {
            kind: "collectionItem",
            collection: "blocks",
            itemKey: "id",
            itemId: "card_one",
            itemKind: "card",
          },
          parent: {
            kind: "collectionItem",
            collection: "blocks",
            itemKey: "id",
            itemId: "nav_main",
            itemKind: "menu",
          },
          position: 1,
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const placement = (result.values.placements as Array<Record<string, unknown>>).find(
      (item) => item.child_id === "card_one",
    );
    expect(placement?.parent_id).toBe("nav_main");
    expect(placement?.parent_kind).toBe("block");
    expect(placement?.position).toBe(1);
  });

  it("refuse de modifier directement un style partagé", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "set",
          target: {
            kind: "collectionItemField",
            collection: "style_profiles",
            itemKey: "id",
            itemId: "profile_main",
            field: "name",
          },
          value: "Style modifié",
        },
      ]),
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("partagé");
  });

  it("crée une copie locale de style et la rattache à la cible", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "insert",
          target: { kind: "collection", collection: "style_profiles" },
          values: { name: "Copie carte", font_size: 16, visibility: "inherit" },
          bindTo: {
            target: {
              kind: "collectionItemField",
              collection: "blocks",
              itemKey: "id",
              itemId: "card_one",
              field: "style_id",
            },
          },
        },
      ]),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const styleId = result.itemIds[0];
    const card = (result.values.blocks as Array<Record<string, unknown>>).find(
      (item) => item.id === "card_one",
    );
    const style = (result.values.style_profiles as Array<Record<string, unknown>>).find(
      (item) => item.id === styleId,
    );
    expect(card?.style_id).toBe(styleId);
    expect(style?.name).toBe("Copie carte");
  });

  it("refuse une cible inconnue avant toute mutation", () => {
    const input = {
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "remove",
          target: {
            kind: "collectionItem" as const,
            collection: "blocks",
            itemKey: "id",
            itemId: "inconnu",
            itemKind: "text",
          },
        },
      ]),
    };
    const errors = validateTemplateEditProposal(input);
    expect(errors.length).toBeGreaterThan(0);
    expect(input.values).toEqual(puzzleV2Values);
  });

  it("refuse une insertion sans règle compatible", () => {
    const result = applyTemplateEditProposal({
      editor: puzzleV2Editor,
      schema: puzzleV2Params,
      values: values(),
      proposal: proposal([
        {
          op: "insertChild",
          parent: cardOne,
          child: {
            collection: "blocks",
            kind: "menu_item",
            slot: "content",
            values: { title: "Contact" },
          },
        },
      ]),
    });

    expect(result.ok).toBe(false);
  });
});
