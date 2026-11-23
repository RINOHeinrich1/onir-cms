import { describe, expect, it } from "vitest";
import { paramsForTab, paramTabsForSchema } from "@/components/links/param-tabs";
import type { TemplateParamSchema } from "@/domain/template-params";

function param(key: string, type: TemplateParamSchema["type"]): TemplateParamSchema {
  return {
    key,
    label: key,
    description: "",
    type,
    default: type === "boolean" ? false : type === "number" ? 0 : "",
  } as TemplateParamSchema;
}

describe("paramTabsForSchema", () => {
  it("ne propose aucun onglet sans paramètre", () => {
    expect(paramTabsForSchema([])).toEqual([]);
  });

  it("masque l'onglet Avancé quand aucun paramètre technique n'existe", () => {
    const tabs = paramTabsForSchema([param("titre", "string"), param("couleur", "color")]);
    expect(tabs.map((tab) => tab.id)).toEqual(["all", "content", "colors"]);
  });

  it("affiche l'onglet Avancé uniquement s'il contient des paramètres", () => {
    const tabs = paramTabsForSchema([
      param("titre", "string"),
      param("actif", "boolean"),
      param("limite", "number"),
    ]);
    expect(tabs.map((tab) => tab.id)).toEqual(["all", "content", "advanced"]);
    expect(paramsForTab([param("actif", "boolean")], "advanced", "")).toHaveLength(1);
  });
});
