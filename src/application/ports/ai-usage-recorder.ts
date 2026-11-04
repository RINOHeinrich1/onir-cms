import type { OrganizationAiUsageEvent } from "@/domain/entities/organization-ai-quota";

export type AiUsageContext = {
  organizationId: string;
  providerId: string | null;
  providerLabel: string;
  model: string;
  clusterId: string | null;
};

/**
 * Garde et journalisation d'un appel IA (ADR-0065).
 * L'implémentation centrale est branchée dans la factory IA afin qu'aucun
 * appel, même futur, ne puisse contourner le comptage.
 */
export interface AiUsageRecorder {
  assertCanCall(context: AiUsageContext): Promise<void>;
  record(event: OrganizationAiUsageEvent): Promise<void>;
}
