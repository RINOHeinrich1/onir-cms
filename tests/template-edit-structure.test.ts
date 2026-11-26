import { describe, expect, it } from "vitest";
import { buildTemplateStructureIndex } from "@/domain/template-edit-structure";
import type { TemplateParamValue, TemplateParamValues } from "@/domain/template-params";
import {
  templateEditEditor as editor,
  templateEditValues as values,
} from "./fixtures/template-edit-fixture";

describe("index de structure des cibles d'édition", () => {
  it("rattache un bloc imbriqué à sa page", () => {
    const index = buildTemplateStructureIndex(editor, values);
    expect(index.get("blocks", "hero_button")?.scope).toEqual({
      kind: "page",
      pageId: "home",
    });
  });

  it("marque une zone d'en-tête partagée", () => {
    const index = buildTemplateStructureIndex(editor, values);
    expect(index.get("blocks", "theme_btn")?.scope).toEqual({
      kind: "shared",
      reason: "header",
      pageIds: ["home", "about"],
    });
  });

  it("marque un bloc orphelin comme unknown", () => {
    const blocks = (values.blocks as TemplateParamValue[] | undefined) ?? [];
    const orphanValues: TemplateParamValues = {
      ...values,
      blocks: [...blocks, { id: "orphan", kind: "text", title: "Orphelin" }],
    };
    const index = buildTemplateStructureIndex(editor, orphanValues);
    expect(index.get("blocks", "orphan")?.scope).toEqual({ kind: "unknown" });
  });

  it("ne boucle pas sur un cycle de placements", () => {
    const blocks = (values.blocks as TemplateParamValue[] | undefined) ?? [];
    const placements = (values.placements as TemplateParamValue[] | undefined) ?? [];
    const cycleValues: TemplateParamValues = {
      ...values,
      blocks: [
        ...blocks,
        { id: "cycle_a", kind: "text", title: "Cycle A" },
        { id: "cycle_b", kind: "text", title: "Cycle B" },
      ],
      placements: [
        ...placements,
        {
          id: "pc1",
          parent_kind: "block",
          parent_id: "cycle_b",
          child_id: "cycle_a",
          slot: "content",
          position: 0,
        },
        {
          id: "pc2",
          parent_kind: "block",
          parent_id: "cycle_a",
          child_id: "cycle_b",
          slot: "content",
          position: 0,
        },
      ],
    };
    const index = buildTemplateStructureIndex(editor, cycleValues);
    expect(index.get("blocks", "cycle_a")?.scope).toEqual({ kind: "unknown" });
    expect(index.get("blocks", "cycle_b")?.scope).toEqual({ kind: "unknown" });
  });
});
