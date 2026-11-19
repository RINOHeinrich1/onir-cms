import type { Actor } from "@/application/actor";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import type { TemplateParamSchema } from "@/domain/template-params";
import type { WidgetDisplay } from "@/domain/widget";
import { listVisualTemplates } from "./manage-visual-templates";

/**
 * Vue sérialisable d'un template installé et de ses versions.
 * Utilisée par les écrans de personnalisation (aperçu de lien, studio).
 */
export type VisualTemplateOptionView = {
  id: string;
  key: string;
  name: string;
  description?: string;
  versions: {
    version: string;
    params: TemplateParamSchema[];
    widget: WidgetDisplay | null;
  }[];
};

/** Charge les templates visibles par l'acteur avec le schéma de chaque version. */
export async function loadVisualTemplateOptions(
  actor: Actor,
  templates: VisualTemplateRepository,
): Promise<VisualTemplateOptionView[]> {
  const list = await listVisualTemplates({ templates }, actor);
  return Promise.all(
    list.map(async (item) => ({
      id: item.id,
      key: item.key,
      name: item.name,
      description: item.description,
      versions: (await templates.listVersions(item.id)).map((version) => ({
        version: version.version,
        params: version.manifest.params,
        widget: version.manifest.ui.widget?.display ?? null,
      })),
    })),
  );
}
