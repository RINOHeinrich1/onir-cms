import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { OrganizationAiQuotaRepository } from "@/application/ports/organization-ai-quota-repository";
import type { OrganizationAiUsageOverview } from "@/domain/entities/organization-ai-quota";

export type DashboardAiUsageDependencies = {
  quotas: Pick<OrganizationAiQuotaRepository, "getUsageOverview">;
};

/** Consommation IA de l'organisation active : total historique et quotas courants. */
export function getDashboardAiUsage(
  deps: DashboardAiUsageDependencies,
  actor: Actor,
): Promise<OrganizationAiUsageOverview> {
  assertCan(actor, "dashboard:view");
  return deps.quotas.getUsageOverview(organizationOf(actor));
}
