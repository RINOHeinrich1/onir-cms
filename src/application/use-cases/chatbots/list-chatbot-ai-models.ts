/** Modèles IA utilisables pour l'assistance de création (ADR-0038). */

import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import { resolveUsageTargets } from "@/application/use-cases/ai/resolve-usage-targets";

export type ChatbotAiModelsDependencies = {
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
  /** Défauts d'usage (ADR-0058). */
  usage?: AiUsageRepository;
};

export type ChatbotAiModelsResult = {
  providers: Array<{
    id: string;
    label: string;
    models: Array<{ modelId: string; label: string }>;
  }>;
  defaultProviderId: string | null;
  defaultModel: string | null;
};

export async function listChatbotAiModels(
  deps: ChatbotAiModelsDependencies,
  actor: Actor,
  requiredPermission: "links:create" = "links:create",
): Promise<ChatbotAiModelsResult> {
  assertCan(actor, requiredPermission);
  assertCan(actor, "ai:read");
  const organizationId = organizationOf(actor);

  const providers = await deps.providers.list(organizationId, { includeArchived: false });
  const result: ChatbotAiModelsResult["providers"] = [];
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
  let defaultProvider = result.find((provider) => provider.id === settings?.defaultProviderId);
  let defaultModel =
    defaultProvider?.models.find((model) => model.modelId === settings?.defaultModel)?.modelId ??
    null;

  if (deps.usage !== undefined) {
    const refs = await resolveUsageTargets(
      { usage: deps.usage },
      { organizationId, usage: "assistant" },
    );
    const assistant = refs[0];
    if (assistant !== undefined && assistant.aiProviderId !== null && assistant.aiModel !== null) {
      const provider = result.find((entry) => entry.id === assistant.aiProviderId);
      const model = provider?.models.find((entry) => entry.modelId === assistant.aiModel);
      if (provider !== undefined && model !== undefined) {
        defaultProvider = provider;
        defaultModel = model.modelId;
      }
    }
  }

  return {
    providers: result,
    defaultProviderId: defaultProvider?.id ?? null,
    defaultModel,
  };
}
