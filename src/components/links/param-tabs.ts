import type { TemplateParamSchema } from "@/domain/template-params";

export type ParamTab = "all" | "content" | "colors" | "images" | "advanced";

export type ParamTabOption = { id: ParamTab; label: string };

export const PARAM_TABS: ParamTabOption[] = [
  { id: "all", label: "Tous" },
  { id: "content", label: "Contenu" },
  { id: "colors", label: "Couleurs" },
  { id: "images", label: "Images" },
  { id: "advanced", label: "Avancé" },
];

export function paramsForTab(
  schema: TemplateParamSchema[],
  tab: ParamTab,
  search: string,
): TemplateParamSchema[] {
  const byTab = schema.filter((param) => {
    switch (tab) {
      case "content":
        return ["string", "text", "url", "select"].includes(param.type);
      case "colors":
        return param.type === "color";
      case "images":
        return param.type === "image";
      case "advanced":
        return ["number", "boolean", "object", "array"].includes(param.type);
      default:
        return true;
    }
  });
  const needle = search.trim().toLocaleLowerCase("fr");
  if (needle === "") return byTab;
  return byTab.filter((param) =>
    [param.key, param.label, param.description].join(" ").toLocaleLowerCase("fr").includes(needle),
  );
}

export function paramTabsForSchema(schema: TemplateParamSchema[]): ParamTabOption[] {
  if (schema.length === 0) return [];
  return PARAM_TABS.filter(
    (tab) => tab.id === "all" || paramsForTab(schema, tab.id, "").length > 0,
  );
}
