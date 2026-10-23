import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  ConflictError,
  NotFoundError,
  UnprocessableError,
  ValidationError,
} from "@/application/errors";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import {
  type AiProvider,
  normalizeAiModel,
  parseAiProviderPreset,
  presetBaseUrl,
  presetDialect,
} from "@/domain/entities/ai-provider";
import { sealAiKey } from "@/lib/ai-crypto";
import { assertAllowedAiBaseUrl } from "@/lib/ai-url-policy";
import { allowPrivateAiNetworks } from "@/lib/env";

export type AiProviderDependencies = {
  providers: AiProviderRepository;
};

function sourceOf(input: unknown): Record<string, unknown> {
  return input !== null && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateLabel(value: unknown): string {
  const label = text(value);
  if (label === "") throw new ValidationError("Nom du fournisseur requis");
  if (label.length > 120) throw new ValidationError("Nom du fournisseur trop long (120 max)");
  return label;
}

function validateModel(value: unknown): string | null {
  const model = normalizeAiModel(value);
  if (model !== null && model.length > 200) {
    throw new ValidationError("Identifiant de modèle trop long (200 max)");
  }
  return model;
}

function resolveBaseUrl(
  source: Record<string, unknown>,
  preset: ReturnType<typeof parseAiProviderPreset>,
  fallback?: string,
): string {
  if (preset === null) throw new ValidationError("Preset de fournisseur invalide");
  const explicit = text(source.baseUrl);
  const productId = text(source.productId);
  const baseUrl =
    explicit !== ""
      ? explicit
      : preset === "infomaniak" && productId !== ""
        ? presetBaseUrl(preset, productId)
        : fallback !== undefined && fallback !== ""
          ? fallback
          : presetBaseUrl(preset, productId);
  if (baseUrl === "") throw new ValidationError("URL de base du fournisseur requise");
  try {
    return assertAllowedAiBaseUrl(baseUrl, { allowPrivate: allowPrivateAiNetworks() });
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : "URL fournisseur invalide");
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "23505";
}

function sealKeyOrThrow(apiKey: string) {
  try {
    return sealAiKey(apiKey);
  } catch {
    throw new UnprocessableError(
      "AI_PROVIDER_KEY absente ou invalide : configurez une clé de 64 caractères hexadécimaux",
    );
  }
}

export async function listAiProviders(
  deps: AiProviderDependencies,
  actor: Actor,
  options: { includeArchived?: boolean } = {},
): Promise<AiProvider[]> {
  assertCan(actor, "ai:list");
  return deps.providers.list(organizationOf(actor), options);
}

export async function createAiProvider(
  deps: AiProviderDependencies,
  actor: Actor,
  input: unknown,
): Promise<AiProvider> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const source = sourceOf(input);
  const preset = parseAiProviderPreset(source.preset);
  if (preset === null) throw new ValidationError("Preset de fournisseur invalide");

  const label = validateLabel(source.label);
  const apiKey = text(source.apiKey);
  if (apiKey === "") throw new ValidationError("Clé API requise");
  const baseUrl = resolveBaseUrl(source, preset);
  const defaultModel = validateModel(source.defaultModel);
  const sealed = sealKeyOrThrow(apiKey);

  try {
    return await deps.providers.create(organizationId, {
      label,
      preset,
      dialect: presetDialect(preset),
      baseUrl,
      sealedKey: sealed,
      apiKeyHint: sealed.hint,
      defaultModel,
      createdBy: actor.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("Un fournisseur porte déjà ce nom");
    }
    throw error;
  }
}

export async function updateAiProvider(
  deps: AiProviderDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<AiProvider> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const existing = await deps.providers.findById(organizationId, id);
  if (existing === null || existing.archivedAt !== null) {
    throw new NotFoundError("Fournisseur introuvable");
  }

  const source = sourceOf(input);
  const preset =
    source.preset === undefined ? existing.preset : parseAiProviderPreset(source.preset);
  if (preset === null) throw new ValidationError("Preset de fournisseur invalide");

  const presetChanged = source.preset !== undefined && preset !== existing.preset;
  const baseUrl =
    source.baseUrl !== undefined || source.productId !== undefined || presetChanged
      ? resolveBaseUrl(source, preset, presetChanged ? undefined : existing.baseUrl)
      : existing.baseUrl;
  const label = source.label === undefined ? existing.label : validateLabel(source.label);
  const defaultModel =
    source.defaultModel === undefined ? existing.defaultModel : validateModel(source.defaultModel);
  const apiKey = text(source.apiKey);
  const sealed = apiKey === "" ? undefined : sealKeyOrThrow(apiKey);

  try {
    const updated = await deps.providers.update(organizationId, id, {
      label,
      preset,
      dialect: presetDialect(preset),
      baseUrl,
      ...(sealed === undefined ? {} : { sealedKey: sealed, apiKeyHint: sealed.hint }),
      defaultModel,
    });
    if (updated === null) throw new NotFoundError("Fournisseur introuvable");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ConflictError("Un fournisseur porte déjà ce nom");
    }
    throw error;
  }
}

export async function archiveAiProvider(
  deps: AiProviderDependencies,
  actor: Actor,
  id: string,
): Promise<AiProvider> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const existing = await deps.providers.findById(organizationId, id);
  if (existing === null || existing.archivedAt !== null) {
    throw new NotFoundError("Fournisseur introuvable");
  }

  const links = await deps.providers.countLinksUsing(organizationId, id);
  if (links > 0) {
    throw new ConflictError(
      `Ce fournisseur est utilisé par ${links} lien(s) : réaffectez-les avant de l'archiver`,
    );
  }
  const settings = await deps.providers.getOrganizationSettings(organizationId);
  if (settings?.defaultProviderId === id) {
    throw new ConflictError("Ce fournisseur est le défaut de l'organisation");
  }

  const archived = await deps.providers.archive(organizationId, id);
  if (archived === null) throw new NotFoundError("Fournisseur introuvable");
  return archived;
}
