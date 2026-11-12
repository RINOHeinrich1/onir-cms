import type { TokenResetMode } from "@/domain/entities/chat";
import type {
  OrganizationAiBudget,
  OrganizationAiQuotaState,
  OrganizationAiTarget,
  OrganizationAiUsageEvent,
  OrganizationAiUsageOverview,
} from "@/domain/entities/organization-ai-quota";

export type OrganizationLimits = {
  organizationId: string;
  maxChatbots: number | null;
  limitProfileId: string | null;
  chatbotsCount: number;
  budget: OrganizationAiBudget | null;
  allocations: OrganizationAiQuotaState["allocations"];
};

export type OrganizationLimitAllocationInput = {
  target: OrganizationAiTarget;
  maxTokens: number | null;
};

export type SaveOrganizationLimitsInput = {
  maxChatbots: number | null;
  maxTokens: number | null;
  maxMessages?: number | null;
  messageLimitPolicy?: "block" | "recycle";
  tokenResetMode: TokenResetMode;
  tokenResetDays: number | null;
  allocations: OrganizationLimitAllocationInput[];
};

/**
 * Port de persistance des quotas d'organisation (ADR-0065).
 * `readState` peut réinitialiser une période expirée ; `recordUsage` écrit le
 * journal et incrémente les compteurs dans une seule transaction.
 */
export interface OrganizationAiQuotaRepository {
  readState(organizationId: string): Promise<OrganizationAiQuotaState>;
  getUsageOverview(organizationId: string): Promise<OrganizationAiUsageOverview>;
  recordUsage(event: OrganizationAiUsageEvent): Promise<void>;
  getLimits(organizationId: string): Promise<OrganizationLimits | null>;
  saveLimits(
    organizationId: string,
    input: SaveOrganizationLimitsInput,
  ): Promise<OrganizationLimits | null>;
  resetBudget(organizationId: string): Promise<boolean>;
  consumeMessage(
    organizationId: string,
    conversationId: string,
  ): Promise<{ allowed: boolean; maxMessages: number | null; messagesUsed: number }>;
}
