/**
 * Modèle géré par un fournisseur (ADR-0030).
 * Le modèle est une entité enfant du fournisseur ; le lien ne stocke que son
 * identifiant texte, compatible avec tous les fournisseurs OpenAI-compatible.
 */

export const AI_MODEL_SOURCES = ["catalog", "manual"] as const;

export type AiModelSource = (typeof AI_MODEL_SOURCES)[number];

export type AiProviderModel = {
  id: string;
  organizationId: string;
  providerId: string;
  modelId: string;
  label: string;
  source: AiModelSource;
  enabled: boolean;
  lastSeenAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export function parseAiModelSource(value: unknown): AiModelSource | null {
  return typeof value === "string" && (AI_MODEL_SOURCES as readonly string[]).includes(value)
    ? (value as AiModelSource)
    : null;
}

export function normalizeAiModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function aiModelLabel(modelId: string, label?: string | null): string {
  const value = label?.trim();
  return value === undefined || value === "" ? modelId : value;
}
