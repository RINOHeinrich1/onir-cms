/**
 * Affectation IA d'un lien et résolution serveur (ADR-0029 §3).
 * La précédence est une décision pure, testable sans base ni réseau.
 */

export type OrganizationAiSettings = {
  organizationId: string;
  defaultProviderId: string | null;
  defaultModel: string | null;
  updatedAt: string;
};

export type AiAssignment = {
  providerId: string;
  model: string;
};

export type AiResolutionSource = "link" | "organization" | "legacy" | "none";

export type AiDecision =
  | { source: "link"; providerId: string; model: string }
  | { source: "organization"; providerId: string; model: string }
  | { source: "legacy" }
  | { source: "none" };

export type LegacyAiPresence = {
  token: string;
  productId: string;
  model: string;
} | null;

export type DecideAiAssignmentInput = {
  link: {
    aiProviderId: string | null;
    aiModel: string | null;
  };
  organization: {
    defaultProviderId: string | null;
    defaultModel: string | null;
  };
  legacy: LegacyAiPresence;
};

/**
 * Résout la cible IA :
 * 1. affectation explicite du lien ;
 * 2. défaut de l'organisation ;
 * 3. configuration legacy de l'environnement ;
 * 4. aucune cible.
 *
 * Une paire incomplète est une erreur de données, jamais un fallback silencieux.
 */
export function decideAiAssignment(input: DecideAiAssignmentInput): AiDecision {
  const { link, organization, legacy } = input;

  if (link.aiProviderId !== null || link.aiModel !== null) {
    if (link.aiProviderId === null || link.aiModel === null) {
      throw new Error("Affectation IA du lien incomplète");
    }
    return { source: "link", providerId: link.aiProviderId, model: link.aiModel };
  }

  if (organization.defaultProviderId !== null || organization.defaultModel !== null) {
    if (organization.defaultProviderId === null || organization.defaultModel === null) {
      throw new Error("Défaut IA de l'organisation incomplet");
    }
    return {
      source: "organization",
      providerId: organization.defaultProviderId,
      model: organization.defaultModel,
    };
  }

  if (legacy !== null) return { source: "legacy" };
  return { source: "none" };
}
