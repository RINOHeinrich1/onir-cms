import { ValidationError } from "@/application/errors";
import type { AiGrantCatalog } from "@/application/ports/ai-grant-repository";
import { AI_USAGES, type AiUsage } from "@/domain/entities/ai-usage";
import { isTokenResetMode, type TokenResetMode } from "@/domain/entities/chat";
import type { OrganizationAiTarget } from "@/domain/entities/organization-ai-quota";
import type {
  OrganizationProvisioning,
  OrganizationProvisioningAllocation,
  OrganizationProvisioningDefault,
} from "@/domain/entities/organization-provisioning";

const MAX_TOKENS = 1_000_000_000_000;
const MAX_CHATBOTS = 1_000_000;
const MAX_ALLOCATIONS = 100;
const MAX_DEFAULTS = AI_USAGES.length;

function has(source: Record<string, unknown>, key: string): boolean {
  return Object.hasOwn(source, key);
}

function integerOrNull(value: unknown, label: string, max: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) {
    throw new ValidationError(`${label} : entier entre 0 et ${max} attendu`);
  }
  return number;
}

function parseTarget(value: unknown): OrganizationAiTarget {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Cible IA invalide");
  }
  const source = value as Record<string, unknown>;
  const kind = source.kind;
  if (kind === "model") {
    const providerId = typeof source.providerId === "string" ? source.providerId.trim() : "";
    const model = typeof source.model === "string" ? source.model.trim() : "";
    if (providerId === "" || model === "") {
      throw new ValidationError("Cible modèle : fournisseur et modèle requis");
    }
    return { kind: "model", providerId, model };
  }
  if (kind === "cluster") {
    const clusterId = typeof source.clusterId === "string" ? source.clusterId.trim() : "";
    if (clusterId === "") throw new ValidationError("Cible cluster : cluster requis");
    return { kind: "cluster", clusterId };
  }
  throw new ValidationError("Cible IA invalide");
}

function targetKey(target: OrganizationAiTarget): string {
  return target.kind === "model"
    ? `model:${target.providerId}:${target.model}`
    : `cluster:${target.clusterId}`;
}

function requireCatalogTarget(catalog: AiGrantCatalog, target: OrganizationAiTarget): void {
  if (target.kind === "cluster") {
    if (!catalog.clusters.some((cluster) => cluster.id === target.clusterId)) {
      throw new ValidationError("Cluster IA introuvable");
    }
    return;
  }
  const provider = catalog.providers.find((entry) => entry.id === target.providerId);
  if (provider === undefined) throw new ValidationError("Fournisseur IA introuvable");
  if (!provider.models.some((model) => model.modelId === target.model)) {
    throw new ValidationError("Modèle IA introuvable");
  }
}

function parseReset(source: Record<string, unknown>): {
  mode: TokenResetMode;
  days: number | null;
} {
  const rawMode = source.tokenResetMode;
  if (rawMode === undefined || rawMode === null || rawMode === "") {
    return { mode: "manual", days: null };
  }
  if (typeof rawMode !== "string" || !isTokenResetMode(rawMode)) {
    throw new ValidationError("Mode de réinitialisation des tokens invalide");
  }
  if (rawMode === "manual") return { mode: "manual", days: null };
  const days = integerOrNull(source.tokenResetDays, "Durée de réinitialisation", 3650);
  if (days === null || days < 1) {
    throw new ValidationError("Durée de réinitialisation : nombre de jours entre 1 et 3650 requis");
  }
  return { mode: "duration", days };
}

function parseAllocations(
  value: unknown,
  catalog: AiGrantCatalog | undefined,
): OrganizationProvisioningAllocation[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError("Liste d'allocations invalide");
  if (value.length > MAX_ALLOCATIONS) {
    throw new ValidationError(`Trop d'allocations (${MAX_ALLOCATIONS} maximum)`);
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ValidationError(`Allocation ${index + 1} invalide`);
    }
    const source = entry as Record<string, unknown>;
    const target = parseTarget(source.target ?? source);
    const key = targetKey(target);
    if (seen.has(key)) throw new ValidationError("Allocation IA en double");
    seen.add(key);
    if (catalog !== undefined) requireCatalogTarget(catalog, target);
    return {
      target,
      maxTokens: has(source, "maxTokens")
        ? integerOrNull(source.maxTokens, "Budget de tokens", MAX_TOKENS)
        : null,
    };
  });
}

function parseDefaults(
  value: unknown,
  allocations: OrganizationProvisioningAllocation[],
  catalog: AiGrantCatalog | undefined,
): OrganizationProvisioningDefault[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError("Liste de défauts IA invalide");
  if (value.length > MAX_DEFAULTS) throw new ValidationError("Trop de défauts IA");
  const allocationKeys = new Set(allocations.map((entry) => targetKey(entry.target)));
  const seen = new Set<AiUsage>();
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ValidationError(`Défaut IA ${index + 1} invalide`);
    }
    const source = entry as Record<string, unknown>;
    const usage = source.usage;
    if (typeof usage !== "string" || !(AI_USAGES as readonly string[]).includes(usage)) {
      throw new ValidationError("Usage IA invalide");
    }
    if (seen.has(usage as AiUsage)) throw new ValidationError("Défaut IA en double");
    seen.add(usage as AiUsage);
    const target = parseTarget(source.target ?? source);
    if (!allocationKeys.has(targetKey(target))) {
      throw new ValidationError("Un défaut IA doit cibler une allocation autorisée");
    }
    if (catalog !== undefined) requireCatalogTarget(catalog, target);
    return { usage: usage as AiUsage, target };
  });
}

/**
 * Valide et normalise le snapshot de provisioning d'une invitation.
 * Si `catalog` est fourni, chaque ressource doit exister dans le catalogue.
 */
export function parseInvitationProvisioning(
  value: unknown,
  catalog?: AiGrantCatalog,
): OrganizationProvisioning | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Provisioning d'invitation invalide");
  }
  const source = value as Record<string, unknown>;
  const allocations = parseAllocations(source.allocations, catalog);
  const parsedDefaults = parseDefaults(source.defaults, allocations, catalog);
  const firstAllocation = allocations[0];
  const defaults =
    parsedDefaults.length === 0 && firstAllocation !== undefined
      ? AI_USAGES.map((usage) => ({ usage, target: firstAllocation.target }))
      : parsedDefaults;
  const reset = parseReset(source);
  return {
    maxChatbots: has(source, "maxChatbots")
      ? integerOrNull(source.maxChatbots, "Nombre maximal de chatbots", MAX_CHATBOTS)
      : null,
    maxTokens: has(source, "maxTokens")
      ? integerOrNull(source.maxTokens, "Budget global de tokens", MAX_TOKENS)
      : null,
    tokenResetMode: reset.mode,
    tokenResetDays: reset.days,
    allocations,
    defaults,
  };
}
