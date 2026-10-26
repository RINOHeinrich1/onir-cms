/** Modèles IA utilisables pour l'assistance de création (ADR-0038). */

import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";

export type TemplateAiModelsDependencies = {
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
};

export type TemplateAiModelsResult = {
  providers: Array<{
    id: string;
    label: string;
    models: Array<{ modelId: string; label: string }>;
  }>;
  defaultProviderId: string | null;
  defaultModel: string | null;
};

export async function listTemplateAiModels(
  deps: TemplateAiModelsDependencies,
  actor: Actor,
): Promise<TemplateAiModelsResult> {
  assertCan(actor, "templates:create");
  assertCan(actor, "ai:read");
  const organizationId = organizationOf(actor);

  const providers = await deps.providers.list(organizationId, { includeArchived: false });
  const result: TemplateAiModelsResult["providers"] = [];
  for (const provider of providers) {
    const models = await deps.models.list(organizationId, provider.id, { enabledOnly: true });
    if (models.length === 0) continue;
    result.push({
      id: provider.id,
      label: provider.label,
      models: models.map((model) => ({ modelId: model.modelId, label: model.label })),
    });
  }

  const settings = await deps.providers.getOrganizationSettings(organizationId);
  const defaultProvider = result.find((provider) => provider.id === settings?.defaultProviderId);
  const defaultModel =
    defaultProvider?.models.find((model) => model.modelId === settings?.defaultModel)?.modelId ??
    null;

  return {
    providers: result,
    defaultProviderId: defaultProvider?.id ?? null,
    defaultModel,
  };
}
