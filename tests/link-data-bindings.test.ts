import { describe, expect, it } from "vitest";
import { parseDataBindingSelections } from "@/application/use-cases/links/link-data-bindings";

describe("parseDataBindingSelections", () => {
  it("accepte undefined, vide et les remises au défaut", () => {
    expect(parseDataBindingSelections(undefined)).toBeNull();
    expect(parseDataBindingSelections({})).toEqual({});
    expect(parseDataBindingSelections({ library: null, autre: "" })).toEqual({
      library: null,
      autre: null,
    });
  });

  it("nettoie les identifiants", () => {
    expect(parseDataBindingSelections({ library: "  binding-1  " })).toEqual({
      library: "binding-1",
    });
  });

  it("refuse les clés et valeurs invalides", () => {
    expect(() => parseDataBindingSelections(null)).toThrow();
    expect(() => parseDataBindingSelections({ Bibliothèque: "x" })).toThrow();
    expect(() => parseDataBindingSelections({ library: 42 })).toThrow();
  });
});
