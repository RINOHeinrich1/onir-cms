import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, UnprocessableError, ValidationError } from "@/application/errors";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import { createAiProvider } from "@/application/use-cases/ai/manage-ai-providers";
import type { AiProvider } from "@/domain/entities/ai-provider";
import type { OrganizationAiSettings } from "@/domain/entities/ai-settings";
import { legacyAiCredentials } from "@/lib/env";

export type OrganizationAiSettingsDependencies = {
  providers: AiProviderRepository;
  models?: AiProviderModelRepository;
};

export async function getOrganizationAiSettings(
  deps: OrganizationAiSettingsDependencies,
  actor: Actor,
): Promise<OrganizationAiSettings | null> {
  assertCan(actor, "ai:read");
  return deps.providers.getOrganizationSettings(organizationOf(actor));
}

export async function setOrganizationDefault(
  deps: OrganizationAiSettingsDependencies,
  actor: Actor,
  input: unknown,
): Promise<OrganizationAiSettings> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const providerId = typeof source.providerId === "string" ? source.providerId.trim() : "";
  const model = typeof source.model === "string" ? source.model.trim() : "";
  if (providerId === "" || model === "") {
    throw new ValidationError("Fournisseur et modèle par défaut requis");
  }
  if (model.length > 200) throw new ValidationError("Identifiant de modèle trop long (200 max)");

  const provider = await deps.providers.findById(organizationId, providerId);
  if (provider === null || provider.archivedAt !== null) {
    throw new NotFoundError("Fournisseur introuvable");
  }
  if (deps.models !== undefined) {
    const modelRow = await deps.models.findByModelId(organizationId, providerId, model);
    if (modelRow === null || !modelRow.enabled) {
      throw new ValidationError("Le modèle par défaut doit être un modèle actif du fournisseur");
    }
  }

  const settings = await deps.providers.setOrganizationDefault(organizationId, {
    providerId,
    model,
    updatedBy: actor.id,
  });
  if (settings === null) throw new Error("Défaut IA non enregistré");
  return settings;
}

export async function clearOrganizationDefault(
  deps: OrganizationAiSettingsDependencies,
  actor: Actor,
): Promise<void> {
  assertCan(actor, "ai:manage");
  await deps.providers.setOrganizationDefault(organizationOf(actor), {
    providerId: null,
    model: null,
    updatedBy: actor.id,
  });
}

/**
 * Import EXPLICITE de la configuration legacy. Aucun secret n'est écrit dans
 * une migration : la clé est lue depuis l'environnement puis chiffrée.
 */
export async function importLegacyAiProvider(
  deps: OrganizationAiSettingsDependencies,
  actor: Actor,
): Promise<AiProvider> {
  assertCan(actor, "ai:manage");
  const legacy = legacyAiCredentials();
  if (legacy === null) {
    throw new UnprocessableError("Aucune configuration IA legacy dans l'environnement");
  }
  const provider = await createAiProvider(deps, actor, {
    label: "Infomaniak (environnement)",
    preset: "infomaniak",
    productId: legacy.productId,
    apiKey: legacy.token,
    defaultModel: legacy.model,
  });
  if (deps.models !== undefined) {
    await deps.models.create(organizationOf(actor), provider.id, {
      modelId: legacy.model,
      source: "manual",
      enabled: true,
      createdBy: actor.id,
    });
  }

  const settings = await deps.providers.getOrganizationSettings(organizationOf(actor));
  if (settings === null) {
    await deps.providers.setOrganizationDefault(organizationOf(actor), {
      providerId: provider.id,
      model: legacy.model,
      updatedBy: actor.id,
    });
  }
  return provider;
}
