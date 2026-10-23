import type { AiClient } from "@/application/ports/ai-client";

export type AiTargetRef = {
  organizationId: string;
  aiProviderId: string | null;
  aiModel: string | null;
};

export type AiResolutionSource = "link" | "organization" | "legacy";

export type ResolvedAiTarget = {
  /** Organisation de résolution (utile à l'adapter, jamais exposée au client). */
  organizationId: string;
  /** null pour le fournisseur virtuel legacy (env). */
  providerId: string | null;
  providerLabel: string;
  model: string;
  source: AiResolutionSource;
};

/**
 * Port de résolution du moteur IA d'un lien.
 * La précédence et le déchiffrement sont des détails d'infrastructure.
 */
export interface AiClientFactory {
  /** Résout la cible sans construire de client ; lève si rien n'est configuré. */
  resolve(target: AiTargetRef | null): Promise<ResolvedAiTarget>;
  /** Construit un client lié au fournisseur/modèle résolu ; lève si indisponible. */
  forTarget(target: AiTargetRef | null): Promise<AiClient>;
  /** Variante fail-open : null si aucun fournisseur résoluble. */
  optionalTarget(target: AiTargetRef | null): Promise<AiClient | null>;
}

/** Helper de test : neutralise la résolution sans I/O. */
export function fixedAiClientFactory(client: AiClient): AiClientFactory {
  return {
    async resolve() {
      return {
        organizationId: "org-test",
        providerId: null,
        providerLabel: "test",
        model: "test",
        source: "legacy",
      };
    },
    async forTarget() {
      return client;
    },
    async optionalTarget() {
      return client;
    },
  };
}
