import { describe, expect, it } from "vitest";
import {
  pruneSelection,
  selectionState,
  toggleVisibleSelection,
} from "@/components/connaissances/connaissance-selection";

describe("sélection des connaissances", () => {
  it("sélectionne uniquement les identifiants visibles", () => {
    expect(toggleVisibleSelection(["hidden"], ["a", "b", "a"])).toEqual(["hidden", "a", "b"]);
  });

  it("désélectionne uniquement les identifiants visibles quand tout est sélectionné", () => {
    expect(toggleVisibleSelection(["hidden", "a", "b"], ["a", "b"])).toEqual(["hidden"]);
  });

  it("calcule les états vide, partiel et complet du maître", () => {
    expect(selectionState([], ["a", "b"])).toBe("none");
    expect(selectionState(["a"], ["a", "b"])).toBe("partial");
    expect(selectionState(["a", "b"], ["a", "b"])).toBe("all");
    expect(selectionState(["a"], [])).toBe("none");
  });

  it("élague les éléments qui ont disparu de la liste", () => {
    expect(pruneSelection(["a", "b", "c"], ["b", "c"])).toEqual(["b", "c"]);
  });
});
