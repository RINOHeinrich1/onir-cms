import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { resolveTemplateParams, type TemplateParamValues } from "@/domain/template-params";
import { latestTemplateVersion } from "@/domain/template-version";

export type DefaultStarterTemplate = {
  templateId: string;
  version: string;
  params: TemplateParamValues;
  colorParamKeys: string[];
  fillableParamKeys: string[];
};

export type DefaultStarterTemplateResult = {
  template: DefaultStarterTemplate | null;
  warnings: string[];
};

/**
 * Résout la dernière version installée et assignée du template `starter`.
 * Aucun template n'est forcé si Starter est absent ou incomplet.
 */
export async function resolveDefaultStarterTemplate(
  visualTemplates: VisualTemplateRepository,
  organizationId: string,
): Promise<DefaultStarterTemplateResult> {
  const starter = await visualTemplates.findByKey("starter");
  if (starter === null) {
    return {
      template: null,
      warnings: ["Template Starter non installé : template par défaut conservé."],
    };
  }
  const assigned = await visualTemplates.findAssignedById(organizationId, starter.id);
  if (assigned === null) {
    return {
      template: null,
      warnings: ["Template Starter non assigné à l’organisation : template par défaut conservé."],
    };
  }
  const versions = await visualTemplates.listVersions(starter.id);
  const latest = latestTemplateVersion(versions);
  if (latest === null) {
    return {
      template: null,
      warnings: ["Template Starter sans version installée : template par défaut conservé."],
    };
  }
  const schema = latest.manifest.params;
  return {
    template: {
      templateId: starter.id,
      version: latest.version,
      params: resolveTemplateParams(schema, {}),
      colorParamKeys: schema.filter((param) => param.type === "color").map((param) => param.key),
      fillableParamKeys: schema
        .filter((param) => param.type !== "url" && param.type !== "image")
        .map((param) => param.key),
    },
    warnings: [],
  };
}
