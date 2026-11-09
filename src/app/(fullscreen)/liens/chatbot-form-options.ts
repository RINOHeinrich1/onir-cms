import { type Actor, actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { listConfidentialites } from "@/application/use-cases/confidentialites/manage-confidentialites";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { listVisualTemplates } from "@/application/use-cases/visual-templates/manage-visual-templates";
import type {
  AiProviderOption,
  ConfidentialiteOption,
  ProspectOption,
  VisualTemplateOption,
} from "@/components/links/types";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";

export type ChatbotFormOptions = {
  prospects: ProspectOption[];
  confidentialites: ConfidentialiteOption[];
  visualTemplates: VisualTemplateOption[];
  aiProviders: AiProviderOption[];
  canAssignAi: boolean;
};

/** Options partagées par les pages dédiées création / brouillon / modification. */
export async function loadChatbotFormOptions(actor: Actor): Promise<ChatbotFormOptions> {
  const pool = getPool();
  const visualTemplateRepo = pgVisualTemplateRepository(pool);
  const [prospects, confidentialites, visualTemplates, aiProviders] = await Promise.all([
    listProspects({ prospects: pgProspectRepository(pool) }, actor),
    listConfidentialites({ confidentialites: pgConfidentialiteRepository(pool) }, actor),
    listVisualTemplates({ templates: visualTemplateRepo }, actor),
    listAiProviders({ providers: pgAiProviderRepository(pool) }, actor),
  ]);

  return {
    prospects,
    confidentialites: confidentialites
      .filter((item) => item.actif)
      .map((item) => ({ id: item.id, titre: item.titre })),
    visualTemplates: await Promise.all(
      visualTemplates.map(async (item) => ({
        id: item.id,
        key: item.key,
        name: item.name,
        versions: (await visualTemplateRepo.listVersions(item.id)).map((version) => ({
          version: version.version,
          params: version.manifest.params,
          widget: version.manifest.ui.widget?.display ?? null,
        })),
      })),
    ),
    aiProviders: aiProviders.map((provider) => ({
      id: provider.id,
      label: provider.label,
      preset: provider.preset,
      defaultModel: provider.defaultModel,
    })),
    canAssignAi: actorCan(actor, "ai:assign"),
  };
}
