import type { AiTargetRef } from "@/application/ports/ai-client-factory";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import type {
  AiCluster,
  AiLinkTarget,
  AiLinkUsage,
  AiTarget,
  AiUsage,
} from "@/domain/entities/ai-usage";

export type ResolveUsageDependencies = {
  usage: AiUsageRepository;
};

export type ResolveUsageInput = {
  organizationId: string;
  usage: AiUsage;
  chatLinkId?: string | null;
  /** Ancienne affectation du lien, conservée pour compatibilité. */
  fallbackTarget?: AiTargetRef | null;
};

function refsFromCluster(cluster: AiCluster): AiTargetRef[] {
  return cluster.members
    .filter((member) => member.enabled)
    .map((member) => ({
      organizationId: cluster.organizationId,
      aiProviderId: member.providerId,
      aiModel: member.model,
    }));
}

function refsFromTarget(target: AiTarget | null, clusters: AiCluster[]): AiTargetRef[] {
  if (target === null) return [];
  if (target.kind === "model") {
    return [{ organizationId: "", aiProviderId: target.providerId, aiModel: target.model }];
  }
  const cluster = clusters.find((entry) => entry.id === target.clusterId && entry.actif);
  return cluster === undefined ? [] : refsFromCluster(cluster);
}

function effectiveTarget(
  linkOverrides: Map<AiLinkUsage, AiLinkTarget>,
  defaults: Map<AiUsage, AiTarget>,
  usage: AiUsage,
): AiTarget | null {
  const link = linkOverrides.get(usage as AiLinkUsage);
  if (link !== undefined && link.kind !== "inherit") return link;
  return defaults.get(usage) ?? null;
}

/**
 * Construit la chaîne de cibles IA d'un usage (ADR-0058).
 * Une chaîne vide signifie qu'il faut laisser le runtime historique décider.
 */
export async function resolveUsageTargets(
  deps: ResolveUsageDependencies,
  input: ResolveUsageInput,
): Promise<AiTargetRef[]> {
  const [defaultsRows, clusters] = await Promise.all([
    deps.usage.listDefaults(input.organizationId),
    deps.usage.listClusters(input.organizationId, false),
  ]);
  const defaults = new Map(defaultsRows.map((row) => [row.usage, row.target]));
  const linkOverrides = new Map<AiLinkUsage, AiLinkTarget>();
  if (input.chatLinkId !== undefined && input.chatLinkId !== null) {
    const rows = await deps.usage.listLinkOverrides(input.organizationId, input.chatLinkId);
    for (const row of rows) linkOverrides.set(row.usage, row.target);
  }

  if (input.usage === "assistant") {
    const target = defaults.get("assistant") ?? null;
    return refsFromTarget(target, clusters).map((ref) => ({
      ...ref,
      organizationId: input.organizationId,
    }));
  }

  const primary = effectiveTarget(linkOverrides, defaults, input.usage);
  if (primary !== null) {
    return refsFromTarget(primary, clusters).map((ref) => ({
      ...ref,
      organizationId: input.organizationId,
    }));
  }

  if (input.usage !== "response") {
    const response = effectiveTarget(linkOverrides, defaults, "response");
    if (response !== null) {
      return refsFromTarget(response, clusters).map((ref) => ({
        ...ref,
        organizationId: input.organizationId,
      }));
    }
  }

  if (input.fallbackTarget !== null && input.fallbackTarget !== undefined) {
    return [{ ...input.fallbackTarget, organizationId: input.organizationId }];
  }
  return [];
}
