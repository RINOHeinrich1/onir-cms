import { describe, expect, it } from "vitest";
import { validateTemplateEditReferences } from "@/domain/template-edit-references";
import { puzzleV2Editor, puzzleV2Values } from "./fixtures/puzzle-v2-reference";

function values() {
  return JSON.parse(JSON.stringify(puzzleV2Values)) as typeof puzzleV2Values;
}

describe("intégrité référentielle finale", () => {
  it("détecte une action qui pointe vers une page inexistante", () => {
    const invalid = values();
    const actions = invalid.actions as Array<Record<string, unknown>>;
    const action = actions.find((item) => item.id === "action_scroll");
    if (action === undefined) throw new Error("action action_scroll absente");
    action.target_id = "block-inexistant";
    const errors = validateTemplateEditReferences(puzzleV2Editor, invalid);
    expect(errors.some((error) => error.field.includes("action_scroll"))).toBe(true);
  });

  it("accepte un état dont les références sont valides", () => {
    const valid = values();
    const action = (valid.actions as Array<Record<string, unknown>>).find(
      (item) => item.id === "action_scroll",
    );
    if (action === undefined) throw new Error("action action_scroll absente");
    action.target_id = "card_one";
    expect(validateTemplateEditReferences(puzzleV2Editor, valid)).toEqual([]);
  });
});
