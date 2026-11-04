import { type Actor, assertSuperAdmin } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import type {
  OrganizationAiQuotaRepository,
  OrganizationLimitAllocationInput,
  OrganizationLimits,
} from "@/application/ports/organization-ai-quota-repository";
import { isTokenResetMode, type TokenResetMode } from "@/domain/entities/chat";
import { organizationAiTargetKey } from "@/domain/entities/organization-ai-quota";

const MAX_REASONABLE_LIMIT = 1_000_000_000_000;
const MAX_CHATBOTS_LIMIT = 1_000_000;
const MAX_ALLOCATIONS = 100;

export type OrganizationAiQuotaReadDependencies = {
  quotas: OrganizationAiQuotaRepository;
};

export type OrganizationAiLimitsDependencies = OrganizationAiQuotaReadDependencies & {
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
  usage: AiUsageRepository;
};

function has(source: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(source, key);
}

function parseInteger(
  value: unknown,
  label: string,
  max: number,
  allowNull: boolean,
): number | null {
  if (value === null || value === undefined || value === "") {
    if (allowNull) return null;
    throw new ValidationError(`${label} requis`);
  }
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    throw new ValidationError(`${label} : entier entre 0 et ${max} attendu`);
  }
  return number;
}

function parseReset(
  source: Record<string, unknown>,
  existing: OrganizationLimits,
): { mode: TokenResetMode; days: number | null } {
  const rawMode = has(source, "tokenResetMode")
    ? source.tokenResetMode
    : (existing.budget?.tokenResetMode ?? "manual");
  if (typeof rawMode !== "string" || !isTokenResetMode(rawMode)) {
    throw new ValidationError("Mode de réinitialisation des tokens invalide");
  }
  if (rawMode === "manual") return { mode: "manual", days: null };
  const rawDays = has(source, "tokenResetDays")
    ? source.tokenResetDays
    : (existing.budget?.tokenResetDays ?? null);
  const days = parseInteger(rawDays, "Durée de réinitialisation", 3650, false);
  if (days === null || days < 1) {
    throw new ValidationError("Durée de réinitialisation : nombre de jours entre 1 et 3650 requis");
  }
  return { mode: "duration", days };
}

async function parseAllocation(
  deps: OrganizationAiLimitsDependencies,
  organizationId: string,
  raw: unknown,
  index: number,
): Promise<OrganizationLimitAllocationInput> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError(`Allocation ${index + 1} invalide`);
  }
  const source = raw as Record<string, unknown>;
  const kind = source.kind;
  const maxTokens = has(source, "maxTokens")
    ? parseInteger(source.maxTokens, "Budget de tokens", MAX_REASONABLE_LIMIT, true)
    : null;

  if (kind === "model") {
    const providerId = typeof source.providerId === "string" ? source.providerId.trim() : "";
    const model = typeof source.model === "string" ? source.model.trim() : "";
    if (providerId === "" || model === "") {
      throw new ValidationError("Allocation modèle : fournisseur et modèle requis");
    }
    const provider = await deps.providers.findById(organizationId, providerId);
    if (provider === null) throw new ValidationError("Fournisseur IA introuvable");
    const modelRow = await deps.models.findByModelId(organizationId, providerId, model);
    if (modelRow === null) throw new ValidationError("Modèle IA introuvable");
    return { target: { kind: "model", providerId, model }, maxTokens };
  }
  if (kind === "cluster") {
    const clusterId = typeof source.clusterId === "string" ? source.clusterId.trim() : "";
    if (clusterId === "") throw new ValidationError("Allocation cluster : cluster requis");
    const clusters = await deps.usage.listClusters(organizationId, true);
    if (!clusters.some((cluster) => cluster.id === clusterId)) {
      throw new ValidationError("Cluster IA introuvable");
    }
    return { target: { kind: "cluster", clusterId }, maxTokens };
  }
  throw new ValidationError("Type d'allocation invalide (model ou cluster)");
}

async function parseAllocations(
  deps: OrganizationAiLimitsDependencies,
  organizationId: string,
  raw: unknown,
): Promise<OrganizationLimitAllocationInput[]> {
  if (!Array.isArray(raw)) throw new ValidationError("Liste d'allocations invalide");
  if (raw.length > MAX_ALLOCATIONS) {
    throw new ValidationError(`Trop d'allocations (${MAX_ALLOCATIONS} maximum)`);
  }
  const result: OrganizationLimitAllocationInput[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.entries()) {
    const allocation = await parseAllocation(deps, organizationId, entry, index);
    const target = allocation.target;
    const key = organizationAiTargetKey(target);
    if (seen.has(key)) throw new ValidationError("Allocation IA en double");
    seen.add(key);
    result.push(allocation);
  }
  return result;
}

async function loadLimits(
  deps: OrganizationAiQuotaReadDependencies,
  organizationId: string,
): Promise<OrganizationLimits> {
  const limits = await deps.quotas.getLimits(organizationId);
  if (limits === null) throw new NotFoundError("Organisation introuvable");
  return limits;
}

/** Lit les limites d'organisation (super-admin uniquement). */
export async function getOrganizationAiLimits(
  deps: OrganizationAiQuotaReadDependencies,
  actor: Actor,
  organizationId: string,
): Promise<OrganizationLimits> {
  assertSuperAdmin(actor);
  return loadLimits(deps, organizationId);
}

/**
 * Enregistre les limites d'une organisation (super-admin uniquement).
 * Les champs absents conservent leur valeur ; les allocations fournies
 * remplacent la liste complète. Les compteurs existants ne sont pas remis à zéro.
 */
export async function saveOrganizationAiLimits(
  deps: OrganizationAiLimitsDependencies,
  actor: Actor,
  organizationId: string,
  raw: unknown,
): Promise<OrganizationLimits> {
  assertSuperAdmin(actor);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Requête invalide");
  }
  const source = raw as Record<string, unknown>;
  const existing = await loadLimits(deps, organizationId);

  const maxChatbots = has(source, "maxChatbots")
    ? parseInteger(source.maxChatbots, "Nombre maximal de chatbots", MAX_CHATBOTS_LIMIT, true)
    : existing.maxChatbots;
  const maxTokens = has(source, "maxTokens")
    ? parseInteger(source.maxTokens, "Budget global de tokens", MAX_REASONABLE_LIMIT, true)
    : (existing.budget?.maxTokens ?? null);
  const reset = parseReset(source, existing);
  const allocations = has(source, "allocations")
    ? await parseAllocations(deps, organizationId, source.allocations)
    : existing.allocations.map((allocation) => ({
        target: allocation.target,
        maxTokens: allocation.maxTokens,
      }));

  const updated = await deps.quotas.saveLimits(organizationId, {
    maxChatbots,
    maxTokens,
    tokenResetMode: reset.mode,
    tokenResetDays: reset.days,
    allocations,
  });
  if (updated === null) throw new NotFoundError("Organisation introuvable");
  return updated;
}

/** Réinitialise le budget et les allocations (super-admin uniquement). */
export async function resetOrganizationAiTokens(
  deps: OrganizationAiQuotaReadDependencies,
  actor: Actor,
  organizationId: string,
): Promise<OrganizationLimits> {
  assertSuperAdmin(actor);
  const reset = await deps.quotas.resetBudget(organizationId);
  if (!reset) throw new NotFoundError("Budget IA introuvable pour cette organisation");
  return loadLimits(deps, organizationId);
}
