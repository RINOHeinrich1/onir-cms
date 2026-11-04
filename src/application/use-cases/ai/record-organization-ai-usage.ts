import { AiQuotaExceededError } from "@/application/errors";
import type { AiUsageContext, AiUsageRecorder } from "@/application/ports/ai-usage-recorder";
import type { OrganizationAiQuotaRepository } from "@/application/ports/organization-ai-quota-repository";
import {
  isTokenQuotaReached,
  normalizeTokenCount,
  type OrganizationAiAllocation,
  type OrganizationAiUsageEvent,
  organizationAiTargetKey,
} from "@/domain/entities/organization-ai-quota";

export type OrganizationAiUsageRecorderDependencies = {
  quotas: Pick<OrganizationAiQuotaRepository, "readState" | "recordUsage">;
};

function allocationReached(allocation: OrganizationAiAllocation): boolean {
  return isTokenQuotaReached(allocation.maxTokens, allocation.tokensUsed);
}

function allocationFor(
  allocations: OrganizationAiAllocation[],
  context: AiUsageContext,
): OrganizationAiAllocation[] {
  const targets = [
    organizationAiTargetKey({
      kind: "model",
      providerId: context.providerId ?? "",
      model: context.model,
    }),
  ];
  if (context.clusterId !== null) {
    targets.push(organizationAiTargetKey({ kind: "cluster", clusterId: context.clusterId }));
  }
  return allocations.filter((allocation) =>
    targets.includes(organizationAiTargetKey(allocation.target)),
  );
}

/**
 * Crée le garde-fou central des quotas IA.
 *
 * Le contrôle est volontairement souple (ADR-0048/0065) : il s'exécute avant
 * l'appel ; un appel déjà parti peut dépasser légèrement le plafond.
 */
export function createOrganizationAiUsageRecorder(
  deps: OrganizationAiUsageRecorderDependencies,
): AiUsageRecorder {
  return {
    async assertCanCall(context: AiUsageContext): Promise<void> {
      if (context.organizationId === "") return;
      const state = await deps.quotas.readState(context.organizationId);

      if (
        state.budget !== null &&
        isTokenQuotaReached(state.budget.maxTokens, state.budget.tokensUsed)
      ) {
        throw new AiQuotaExceededError(
          "Le budget IA de cette organisation est épuisé. Contactez l'administrateur.",
        );
      }

      const allocation = allocationFor(state.allocations, context).find(allocationReached);
      if (allocation !== undefined) {
        throw new AiQuotaExceededError(
          allocation.target.kind === "cluster"
            ? "Le budget IA de ce cluster est épuisé."
            : "Le budget IA de ce modèle est épuisé.",
        );
      }
    },

    async record(event: OrganizationAiUsageEvent): Promise<void> {
      await deps.quotas.recordUsage({
        ...event,
        promptTokens: normalizeTokenCount(event.promptTokens),
        completionTokens: normalizeTokenCount(event.completionTokens),
        totalTokens: normalizeTokenCount(event.totalTokens),
      });
    },
  };
}
