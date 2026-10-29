import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import {
  AI_LINK_USAGES,
  AI_USAGES,
  type AiLinkTarget,
  type AiTarget,
  type AiUsage,
} from "@/domain/entities/ai-usage";

export type AiUsageDependencies = {
  usage: AiUsageRepository;
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
  links?: ChatLinkRepository;
};

function targetFromInput(value: unknown, allowInherit: boolean): AiLinkTarget {
  const source =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const kind = typeof source.kind === "string" ? source.kind : "";
  if (kind === "inherit") {
    if (!allowInherit) throw new ValidationError("Cette cible ne peut pas hériter");
    return { kind: "inherit" };
  }
  if (kind === "cluster") {
    const clusterId = typeof source.clusterId === "string" ? source.clusterId.trim() : "";
    if (clusterId === "") throw new ValidationError("Cluster obligatoire");
    return { kind: "cluster", clusterId };
  }
  if (kind === "model") {
    const providerId = typeof source.providerId === "string" ? source.providerId.trim() : "";
    const model = typeof source.model === "string" ? source.model.trim() : "";
    if (providerId === "" || model === "") {
      throw new ValidationError("Fournisseur et modèle obligatoires");
    }
    return { kind: "model", providerId, model };
  }
  throw new ValidationError("Cible IA invalide");
}

async function validateTarget(
  deps: AiUsageDependencies,
  organizationId: string,
  target: AiTarget,
): Promise<void> {
  if (target.kind === "cluster") {
    const cluster = await deps.usage.findCluster(organizationId, target.clusterId);
    if (cluster === null || !cluster.actif)
      throw new NotFoundError("Cluster introuvable ou inactif");
    if (cluster.members.length === 0) throw new ValidationError("Le cluster n'a aucun membre");
    return;
  }
  const provider = await deps.providers.findById(organizationId, target.providerId);
  if (provider === null || provider.archivedAt !== null) {
    throw new NotFoundError("Fournisseur introuvable");
  }
  const model = await deps.models.findByModelId(organizationId, target.providerId, target.model);
  if (model === null || !model.enabled) throw new ValidationError("Modèle IA inactif");
}

export async function listAiUsageDefaults(deps: Pick<AiUsageDependencies, "usage">, actor: Actor) {
  assertCan(actor, "ai:read");
  return deps.usage.listDefaults(organizationOf(actor));
}

export async function setAiUsageDefault(
  deps: AiUsageDependencies,
  actor: Actor,
  usage: string,
  input: unknown,
) {
  assertCan(actor, "ai:manage");
  if (!(AI_USAGES as readonly string[]).includes(usage)) {
    throw new ValidationError("Usage IA invalide");
  }
  const target = targetFromInput(input, false);
  if (target.kind === "inherit") throw new ValidationError("Cible IA invalide");
  await validateTarget(deps, organizationOf(actor), target);
  await deps.usage.setDefault(organizationOf(actor), usage as AiUsage, target, actor.id);
}

export async function clearAiUsageDefault(
  deps: Pick<AiUsageDependencies, "usage">,
  actor: Actor,
  usage: string,
) {
  assertCan(actor, "ai:manage");
  if (!(AI_USAGES as readonly string[]).includes(usage)) {
    throw new ValidationError("Usage IA invalide");
  }
  await deps.usage.clearDefault(organizationOf(actor), usage as AiUsage);
}

export async function listAiClusters(
  deps: Pick<AiUsageDependencies, "usage">,
  actor: Actor,
  includeInactive = false,
) {
  assertCan(actor, "ai:read");
  return deps.usage.listClusters(organizationOf(actor), includeInactive);
}

export async function createAiCluster(deps: AiUsageDependencies, actor: Actor, input: unknown) {
  assertCan(actor, "ai:manage");
  const cluster = await parseCluster(deps, actor, input);
  const existing = await deps.usage.listClusters(organizationOf(actor), true);
  if (existing.some((entry) => entry.label.toLowerCase() === cluster.label.toLowerCase())) {
    throw new ConflictError("Un cluster porte déjà ce nom");
  }
  return deps.usage.createCluster(organizationOf(actor), cluster, actor.id);
}

export async function updateAiCluster(
  deps: AiUsageDependencies,
  actor: Actor,
  id: string,
  input: unknown,
) {
  assertCan(actor, "ai:manage");
  const cluster = await parseCluster(deps, actor, input);
  const existing = await deps.usage.listClusters(organizationOf(actor), true);
  if (
    existing.some(
      (entry) => entry.id !== id && entry.label.toLowerCase() === cluster.label.toLowerCase(),
    )
  ) {
    throw new ConflictError("Un cluster porte déjà ce nom");
  }
  const updated = await deps.usage.updateCluster(organizationOf(actor), id, cluster);
  if (updated === null) throw new NotFoundError("Cluster introuvable");
  return updated;
}

export async function deleteAiCluster(
  deps: AiUsageDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "ai:manage");
  const cluster = await deps.usage.findCluster(organizationOf(actor), id);
  if (cluster === null) throw new NotFoundError("Cluster introuvable");
  const defaults = await deps.usage.listDefaults(organizationOf(actor));
  if (defaults.some((entry) => entry.target.kind === "cluster" && entry.target.clusterId === id)) {
    throw new ConflictError("Cluster utilisé par un défaut IA");
  }
  const deleted = await deps.usage.deleteCluster(organizationOf(actor), id);
  if (!deleted) throw new NotFoundError("Cluster introuvable");
}

export async function getLinkAiOverrides(
  deps: AiUsageDependencies,
  actor: Actor,
  chatLinkId: string,
) {
  assertCan(actor, "links:list");
  return deps.usage.listLinkOverrides(organizationOf(actor), chatLinkId);
}

export async function setLinkAiOverrides(
  deps: AiUsageDependencies,
  actor: Actor,
  chatLinkId: string,
  input: unknown,
) {
  assertCan(actor, "links:update");
  const organizationId = organizationOf(actor);
  const link =
    deps.links === undefined ? null : await deps.links.findById(organizationId, chatLinkId);
  if (deps.links !== undefined && link === null) throw new NotFoundError("Chatbot introuvable");
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  for (const usage of AI_LINK_USAGES) {
    const raw = source[usage];
    if (raw === undefined) continue;
    const target = targetFromInput(raw, true);
    if (target.kind !== "inherit") await validateTarget(deps, organizationId, target);
    if (target.kind === "inherit") {
      await deps.usage.clearLinkOverride(organizationId, chatLinkId, usage);
    } else {
      await deps.usage.setLinkOverride(organizationId, chatLinkId, usage, target);
    }
  }
}

async function parseCluster(deps: AiUsageDependencies, actor: Actor, input: unknown) {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const label = typeof source.label === "string" ? source.label.trim() : "";
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const actif = source.actif !== false;
  if (label === "" || label.length > 120) {
    throw new ValidationError("Nom du cluster obligatoire (120 caractères maximum)");
  }
  if (!Array.isArray(source.members) || source.members.length === 0) {
    throw new ValidationError("Ajoutez au moins un modèle au cluster");
  }
  const members: { providerId: string; model: string; enabled: boolean }[] = [];
  for (const entry of source.members) {
    const row =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : {};
    const providerId = typeof row.providerId === "string" ? row.providerId.trim() : "";
    const model = typeof row.model === "string" ? row.model.trim() : "";
    if (providerId === "" || model === "") {
      throw new ValidationError("Chaque membre doit avoir un fournisseur et un modèle");
    }
    await validateTarget(deps, organizationOf(actor), { kind: "model", providerId, model });
    members.push({ providerId, model, enabled: row.enabled !== false });
  }
  return { label, description, actif, members };
}
