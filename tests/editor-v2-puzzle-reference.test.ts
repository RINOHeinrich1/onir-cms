import { describe, expect, it } from "vitest";
import { validateTemplateManifest } from "@/domain/entities/visual-template";
import {
  bindingsForRegion,
  resolveDynamicRegionItem,
  validateTemplateEditorBlock,
  validateTemplateEditorCollectionValues,
  validateTemplateEditorStructureValues,
} from "@/domain/template-editor";
import { validateTemplateParamValues } from "@/domain/template-params";
import {
  puzzleV2Editor,
  puzzleV2Manifest,
  puzzleV2Params,
  puzzleV2Values,
} from "./fixtures/puzzle-v2-reference";

describe("référence Editor V2 — structure type Puzzle", () => {
  it("valide le manifeste complet de référence", () => {
    const result = validateTemplateManifest(puzzleV2Manifest);
    if (!result.ok) console.error(result.errors);
    expect(result.ok).toBe(true);
  });

  it("valide le contrat complet du template de référence", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    if (!result.ok) console.error(result.errors);
    expect(result.ok).toBe(true);
  });

  it("valide les valeurs et les identifiants de collection", () => {
    expect(validateTemplateParamValues(puzzleV2Params, puzzleV2Values)).toEqual([]);
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    expect(validateTemplateEditorCollectionValues(result.value, puzzleV2Values)).toEqual([]);
  });

  it("cible une card sans exposer les autres blocs", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const item = resolveDynamicRegionItem(result.value, "block:card_one", puzzleV2Values);
    expect(item?.item.title).toBe("Formation informatique");
    expect(bindingsForRegion(result.value, "block:card_one")).toHaveLength(1);
  });

  it("refuse un identifiant dupliqué dans une collection réelle", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorCollectionValues(result.value, {
      ...puzzleV2Values,
      blocks: [
        ...(puzzleV2Values.blocks ?? []),
        {
          id: "card_one",
          kind: "card",
          name: "Doublon",
          title: "",
          description: "",
          style_id: "",
          action_id: "",
        },
      ],
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("dupliqué");
  });

  it("refuse un enfant référencé même si la collection enfant est vide", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorStructureValues(result.value, {
      ...puzzleV2Values,
      blocks: [],
    });
    expect(errors.some((error) => error.message.includes("enfant inexistant"))).toBe(true);
  });

  it("refuse un parent inexistant", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorStructureValues(result.value, {
      ...puzzleV2Values,
      pages: [],
    });
    expect(errors.some((error) => error.message.includes("parent inexistant"))).toBe(true);
  });

  it("refuse un placement dupliqué", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorStructureValues(result.value, {
      ...puzzleV2Values,
      placements: [
        ...(puzzleV2Values.placements ?? []),
        {
          id: "placement_hero",
          parent_id: "home",
          parent_kind: "page",
          child_id: "card_one",
          position: 1,
          slot: "main",
        },
      ],
    });
    expect(errors.some((error) => error.message.includes("placement dupliqué"))).toBe(true);
  });

  it("détecte un cycle réel de contenance entre composants", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
    if (!result.ok || result.value === undefined) return;
    const errors = validateTemplateEditorStructureValues(result.value, {
      ...puzzleV2Values,
      placements: [
        ...(puzzleV2Values.placements ?? []),
        {
          id: "placement_cycle",
          parent_id: "card_one",
          parent_kind: "block",
          child_id: "hero_main",
          position: 1,
          slot: "children",
        },
      ],
    });
    expect(errors.some((error) => error.message.includes("cycle"))).toBe(true);
  });

  it("conserve les cycles fonctionnels blocks → actions → blocks", () => {
    const result = validateTemplateEditorBlock(puzzleV2Editor, puzzleV2Params);
    expect(result.ok).toBe(true);
  });
});
