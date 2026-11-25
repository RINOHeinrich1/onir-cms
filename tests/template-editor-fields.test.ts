import { describe, expect, it } from "vitest";
import {
  fieldRuleFor,
  groupsForParam,
  isVisibleWhen,
  valueLabelFor,
} from "@/domain/template-editor-fields";

describe("métadonnées sidebar", () => {
  it("filtre les groupes d’un paramètre", () => {
    const groups = [
      { param: "theme", id: "colors", label: "Couleurs", fields: ["primary"] },
      { param: "other", id: "x", label: "X", fields: ["y"] },
    ];
    expect(groupsForParam(groups, "theme")).toHaveLength(1);
  });

  it("évalue les conditions génériques", () => {
    expect(isVisibleWhen({ field: "mode", equals: "embedded" }, { mode: "embedded" })).toBe(true);
    expect(isVisibleWhen({ field: "mode", in: ["a", "b"] }, { mode: "b" })).toBe(true);
    expect(isVisibleWhen({ field: "mode", notIn: ["a"] }, { mode: "b" })).toBe(true);
    expect(isVisibleWhen({ field: "enabled", truthy: true }, { enabled: true })).toBe(true);
  });

  it("retrouve une règle et un libellé de valeur", () => {
    const rules = [{ param: "theme", field: "size", visibleWhen: { field: "mode", equals: "x" } }];
    expect(fieldRuleFor(rules, "theme", "size")?.field).toBe("size");
    expect(valueLabelFor({ theme: { size: { "-1": "Auto" } } }, "theme", "size", -1)).toBe("Auto");
  });
});
