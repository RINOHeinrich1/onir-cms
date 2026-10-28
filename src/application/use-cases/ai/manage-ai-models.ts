import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  BadGatewayError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/application/errors";
import type { AiMessage } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AiModelCatalog, AiModelCatalogResult } from "@/application/ports/ai-model-catalog";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import { aiCapabilitiesFor, parseReasoningMode } from "@/domain/ai-capabilities";
import { type AiProviderModel, aiModelLabel, normalizeAiModelId } from "@/domain/entities/ai-model";
import type { AiProvider } from "@/domain/entities/ai-provider";
import { openAiKey } from "@/lib/ai-crypto";

export type AiModelDependencies = {
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
  catalog: AiModelCatalog;
  /** Requis uniquement pour tester un modèle (chat de test). */
  aiFactory?: AiClientFactory;
};

export type AiModelTestResult = {
  ok: boolean;
  response: string;
  latencyMs: number;
  error: string;
};

function sourceOf(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function validateModelId(value: unknown): string {
  const modelId = normalizeAiModelId(value);
  if (modelId === null) throw new ValidationError("Identifiant de modèle requis");
  if (modelId.length > 200) throw new ValidationError("Identifiant de modèle trop long (200 max)");
  return modelId;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "23505";
}

async function requireProvider(
  deps: AiModelDependencies,
  organizationId: string,
  providerId: string,
): Promise<AiProvider> {
  const provider = await deps.providers.findById(organizationId, providerId);
  if (provider === null || provider.archivedAt !== null) {
    throw new NotFoundError("Fournisseur introuvable");
  }
  return provider;
}

export async function listProviderModels(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  options: { enabledOnly?: boolean } = {},
): Promise<AiProviderModel[]> {
  assertCan(actor, "ai:read");
  const organizationId = organizationOf(actor);
  await requireProvider(deps, organizationId, providerId);
  return deps.models.list(organizationId, providerId, options);
}

/** Synchronise le catalogue distant sans supprimer les modèles locaux. */
export async function syncProviderModels(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
): Promise<{ models: AiProviderModel[]; imported: number; catalogSize: number }> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const provider = await requireProvider(deps, organizationId, providerId);
  const sealed = await deps.providers.getSealedKey(organizationId, providerId);
  if (sealed === null) throw new NotFoundError("Clé fournisseur introuvable");

  let apiKey: string;
  try {
    apiKey = openAiKey(sealed);
  } catch {
    throw new BadGatewayError(
      "Clé fournisseur illisible : vérifiez Configuration → Secrets applicatifs",
    );
  }

  let catalog: AiModelCatalogResult;
  try {
    catalog = await deps.catalog.listModels({
      baseUrl: provider.baseUrl,
      apiKey,
      cacheKey: `${provider.id}:${provider.updatedAt}`,
    });
  } catch (error) {
    throw new BadGatewayError(
      error instanceof Error ? error.message : "Catalogue fournisseur indisponible",
    );
  }

  const before = await deps.models.list(organizationId, providerId);
  const beforeIds = new Set(before.map((model) => model.modelId));
  const models = await deps.models.syncCatalog(organizationId, providerId, catalog.models);
  const imported = models.filter((model) => !beforeIds.has(model.modelId)).length;
  return { models, imported, catalogSize: catalog.models.length };
}

export async function addManualProviderModel(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  input: unknown,
): Promise<AiProviderModel> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  await requireProvider(deps, organizationId, providerId);
  const source = sourceOf(input);
  const modelId = validateModelId(source.modelId);
  const label = aiModelLabel(modelId, typeof source.label === "string" ? source.label : null);
  try {
    return await deps.models.create(organizationId, providerId, {
      modelId,
      label,
      source: "manual",
      enabled: true,
      createdBy: actor.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("Ce modèle existe déjà pour ce fournisseur");
    }
    throw error;
  }
}

export async function setProviderModelEnabled(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  modelRowId: string,
  enabled: boolean,
): Promise<AiProviderModel> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const provider = await requireProvider(deps, organizationId, providerId);
  const model = await deps.models.findById(organizationId, providerId, modelRowId);
  if (model === null) throw new NotFoundError("Modèle introuvable");
  if (!enabled && provider.defaultModel === model.modelId) {
    throw new ConflictError("Impossible de désactiver le modèle par défaut du fournisseur");
  }
  if (!enabled) {
    const settings = await deps.providers.getOrganizationSettings(organizationId);
    if (settings?.defaultProviderId === providerId && settings.defaultModel === model.modelId) {
      throw new ConflictError("Impossible de désactiver le modèle par défaut de l'organisation");
    }
  }
  const updated = await deps.models.setEnabled(organizationId, providerId, modelRowId, enabled);
  if (updated === null) throw new NotFoundError("Modèle introuvable");
  return updated;
}

export async function setProviderModelReasoning(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  modelRowId: string,
  reasoningMode: unknown,
): Promise<AiProviderModel> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const provider = await requireProvider(deps, organizationId, providerId);
  const model = await deps.models.findById(organizationId, providerId, modelRowId);
  if (model === null) throw new NotFoundError("Modèle introuvable");
  const parsed = parseReasoningMode(reasoningMode);
  if (parsed === null) {
    throw new ValidationError("Mode de raisonnement invalide");
  }
  if (!aiCapabilitiesFor(provider.preset, model.modelId).supportsReasoningToggle) {
    throw new ValidationError("Ce fournisseur ne permet pas de contrôler le raisonnement");
  }
  const updated = await deps.models.setReasoningMode(
    organizationId,
    providerId,
    modelRowId,
    parsed,
  );
  if (updated === null) throw new NotFoundError("Modèle introuvable");
  return updated;
}

export async function removeProviderModel(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  modelRowId: string,
): Promise<void> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const provider = await requireProvider(deps, organizationId, providerId);
  const model = await deps.models.findById(organizationId, providerId, modelRowId);
  if (model === null) throw new NotFoundError("Modèle introuvable");
  if (provider.defaultModel === model.modelId) {
    throw new ConflictError("Impossible de supprimer le modèle par défaut du fournisseur");
  }
  const settings = await deps.providers.getOrganizationSettings(organizationId);
  if (settings?.defaultProviderId === providerId && settings.defaultModel === model.modelId) {
    throw new ConflictError("Impossible de supprimer le modèle par défaut de l'organisation");
  }
  const links = await deps.models.countLinksUsing(organizationId, providerId, model.modelId);
  if (links > 0) {
    throw new ConflictError(
      `Ce modèle est utilisé par ${links} lien(s) : réaffectez-les avant de le supprimer`,
    );
  }
  await deps.models.remove(organizationId, providerId, modelRowId);
}

function sanitizeTestMessages(value: unknown): AiMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is { role: string; content: string } => {
      if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return false;
      const row = entry as Record<string, unknown>;
      return (
        (row.role === "user" || row.role === "assistant") &&
        typeof row.content === "string" &&
        row.content.trim() !== ""
      );
    })
    .slice(-20)
    .map((entry) => ({
      role: entry.role as "user" | "assistant",
      content: entry.content.slice(0, 4000),
    }));
}

/** Teste réellement un modèle (complétion courte ou chat de test). */
export async function testProviderModel(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  modelRowId: string,
  input: unknown,
): Promise<AiModelTestResult> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  await requireProvider(deps, organizationId, providerId);
  const model = await deps.models.findById(organizationId, providerId, modelRowId);
  if (model === null) throw new NotFoundError("Modèle introuvable");
  if (deps.aiFactory === undefined) {
    throw new ValidationError("Test IA indisponible : factory non configurée");
  }

  const source = sourceOf(input);
  const messages = sanitizeTestMessages(source.messages);
  const quickMessage =
    typeof source.message === "string" ? source.message.trim().slice(0, 4000) : "";
  const conversation =
    messages.length > 0
      ? messages
      : [
          {
            role: "user" as const,
            content: quickMessage === "" ? "Réponds uniquement par OK." : quickMessage,
          },
        ];
  const requestedMax = typeof source.maxTokens === "number" ? source.maxTokens : 80;
  const maxTokens = Math.max(8, Math.min(800, Math.floor(requestedMax)));
  const startedAt = Date.now();

  try {
    const ai = await deps.aiFactory.forTarget({
      organizationId,
      aiProviderId: providerId,
      aiModel: model.modelId,
    });
    const response = await ai.complete({
      system: "Tu es un assistant de test du dashboard Onirtech. Réponds de façon concise.",
      messages: conversation,
      maxTokens,
    });
    return { ok: true, response, latencyMs: Date.now() - startedAt, error: "" };
  } catch (error) {
    return {
      ok: false,
      response: "",
      latencyMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Test IA impossible",
    };
  }
}

export async function setProviderDefaultModel(
  deps: AiModelDependencies,
  actor: Actor,
  providerId: string,
  input: unknown,
): Promise<AiProvider> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  await requireProvider(deps, organizationId, providerId);
  const source = sourceOf(input);
  const modelId = normalizeAiModelId(source.modelId);
  if (modelId === null) {
    const updated = await deps.providers.update(organizationId, providerId, {
      defaultModel: null,
    });
    if (updated === null) throw new NotFoundError("Fournisseur introuvable");
    return updated;
  }
  const model = await deps.models.findByModelId(organizationId, providerId, modelId);
  if (model === null || !model.enabled) {
    throw new ValidationError("Le modèle par défaut doit être un modèle actif du fournisseur");
  }
  const updated = await deps.providers.update(organizationId, providerId, {
    defaultModel: model.modelId,
  });
  if (updated === null) throw new NotFoundError("Fournisseur introuvable");
  return updated;
}
