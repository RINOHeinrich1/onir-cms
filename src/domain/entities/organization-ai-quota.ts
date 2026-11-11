/**
 * Quotas IA d'une organisation (ADR-0065) — entités pures.
 *
 * Un budget global couvre tous les appels IA. Des allocations ciblent soit un
 * couple fournisseur/modèle, soit un cluster. L'absence de budget ou
 * d'allocation signifie « illimité », sous réserve des autres plafonds.
 */

import type { TokenResetMode } from "@/domain/entities/chat";

export type OrganizationAiTarget =
  | { kind: "model"; providerId: string; model: string }
  | { kind: "cluster"; clusterId: string };

export type OrganizationAiBudget = {
  organizationId: string;
  maxTokens: number | null;
  tokensUsed: number;
  maxMessages?: number | null;
  messagesUsed?: number;
  tokenResetMode: TokenResetMode;
  tokenResetDays: number | null;
  tokenPeriodStartedAt: string;
};

export type OrganizationAiAllocation = {
  id: string;
  organizationId: string;
  target: OrganizationAiTarget;
  maxTokens: number | null;
  tokensUsed: number;
};

export type OrganizationAiUsageEvent = {
  organizationId: string;
  providerId: string | null;
  providerLabel: string;
  model: string;
  clusterId: string | null;
  usage: string;
  linkId?: string | null;
  conversationId?: string | null;
  userId?: string | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type OrganizationAiQuotaState = {
  budget: OrganizationAiBudget | null;
  allocations: OrganizationAiAllocation[];
};

/** Allocation enrichie pour l'affichage (libellé de la ressource résolu). */
export type OrganizationAiAllocationOverview = OrganizationAiAllocation & {
  label: string;
};

/** Lecture agrégée pour le dashboard : total historique + quotas courants. */
export type OrganizationAiUsageOverview = {
  organizationId: string;
  totalTokens: number;
  budget: OrganizationAiBudget | null;
  allocations: OrganizationAiAllocationOverview[];
};

/** Vrai si un plafond est atteint. `null` signifie illimité. */
export function isTokenQuotaReached(maxTokens: number | null, tokensUsed: number): boolean {
  return maxTokens !== null && tokensUsed >= maxTokens;
}

/** Reste disponible, ou `null` si le plafond est illimité. */
export function tokenQuotaRemaining(maxTokens: number | null, tokensUsed: number): number | null {
  if (maxTokens === null) return null;
  return Math.max(0, maxTokens - tokensUsed);
}

/** Clé stable d'une cible de quota. */
export function organizationAiTargetKey(target: OrganizationAiTarget): string {
  return target.kind === "model"
    ? `model:${target.providerId}:${target.model}`
    : `cluster:${target.clusterId}`;
}

/** Normalise un compteur de tokens (entier positif ou nul). */
export function normalizeTokenCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.trunc(value));
}
