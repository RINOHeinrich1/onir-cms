/**
 * Snapshot de provisioning d'une organisation invitée (ADR-0065).
 * Il est validé à la création de l'invitation puis appliqué à l'acceptation,
 * dans la même transaction que la création de l'organisation.
 */

import type { AiUsage } from "@/domain/entities/ai-usage";
import type { TokenResetMode } from "@/domain/entities/chat";
import type { OrganizationAiTarget } from "@/domain/entities/organization-ai-quota";

export type OrganizationProvisioningAllocation = {
  target: OrganizationAiTarget;
  maxTokens: number | null;
};

export type OrganizationProvisioningDefault = {
  usage: AiUsage;
  target: OrganizationAiTarget;
};

export type OrganizationProvisioning = {
  maxChatbots: number | null;
  maxTokens: number | null;
  maxMessages?: number | null;
  messageLimitPolicy?: "block" | "recycle";
  maxStorageMb?: number | null;
  tokenResetMode: TokenResetMode;
  tokenResetDays: number | null;
  allocations: OrganizationProvisioningAllocation[];
  defaults: OrganizationProvisioningDefault[];
};
