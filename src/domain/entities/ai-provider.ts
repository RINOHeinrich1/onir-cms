/**
 * Entités et règles métier des fournisseurs IA OpenAI-compatible (ADR-0029).
 * Aucun import framework/infrastructure : ce module reste pur.
 */

export const AI_PROVIDER_PRESETS = [
  "infomaniak",
  "openai",
  "deepseek",
  "openrouter",
  "deepinfra",
  "custom",
] as const;

export type AiProviderPreset = (typeof AI_PROVIDER_PRESETS)[number];

export const AI_PROVIDER_DIALECTS = ["openai", "infomaniak"] as const;

export type AiDialect = (typeof AI_PROVIDER_DIALECTS)[number];

export const AI_PROVIDER_PRESET_LABELS: Record<AiProviderPreset, string> = {
  infomaniak: "Infomaniak",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  openrouter: "OpenRouter",
  deepinfra: "DeepInfra",
  custom: "Autre compatible OpenAI",
};

const PRESET_BASE_URLS: Record<Exclude<AiProviderPreset, "infomaniak" | "custom">, string> = {
  openai: "https://api.openai.com/v1",
  deepseek: "https://api.deepseek.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
  deepinfra: "https://api.deepinfra.com/v1/openai",
};

import type { ReasoningProfile } from "@/domain/ai-capabilities";

export type AiProvider = {
  id: string;
  organizationId: string;
  label: string;
  preset: AiProviderPreset;
  dialect: AiDialect;
  baseUrl: string;
  apiKeyHint: string;
  defaultModel: string | null;
  reasoningProfile?: ReasoningProfile;
  archivedAt: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AiProviderSummary = AiProvider;

/** Vrai si le fournisseur est archivé (aucun nouvel usage, données conservées). */
export function isAiProviderArchived(provider: Pick<AiProvider, "archivedAt">): boolean {
  return provider.archivedAt !== null;
}

export function isAiProviderPreset(value: string): value is AiProviderPreset {
  return (AI_PROVIDER_PRESETS as readonly string[]).includes(value);
}

export function parseAiProviderPreset(value: unknown): AiProviderPreset | null {
  return typeof value === "string" && isAiProviderPreset(value) ? value : null;
}

export function isAiDialect(value: string): value is AiDialect {
  return (AI_PROVIDER_DIALECTS as readonly string[]).includes(value);
}

export function parseAiDialect(value: unknown): AiDialect | null {
  return typeof value === "string" && isAiDialect(value) ? value : null;
}

/** Infomaniak encode le produit dans le chemin de l'API OpenAI-compatible. */
export function infomaniakBaseUrl(productId: string): string {
  return `https://api.infomaniak.com/2/ai/${encodeURIComponent(productId)}/openai/v1`;
}

/**
 * URL proposée par le preset. Elle reste éditable : un fournisseur interne
 * peut utiliser un autre chemin. Infomaniak exige un Product ID.
 */
export function presetBaseUrl(preset: AiProviderPreset, productId?: string): string {
  if (preset === "infomaniak") {
    return productId === undefined || productId.trim() === ""
      ? ""
      : infomaniakBaseUrl(productId.trim());
  }
  if (preset === "custom") return "";
  return PRESET_BASE_URLS[preset];
}

/** Dialecte par défaut d'un preset : seul Infomaniak a un corps spécifique. */
export function presetDialect(preset: AiProviderPreset): AiDialect {
  return preset === "infomaniak" ? "infomaniak" : "openai";
}

/** Indice affichable d'une clé API, jamais la valeur complète. */
export function apiKeyHint(plain: string): string {
  const trimmed = plain.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}

export function maskApiKey(hint: string): string {
  return hint.trim() === "" ? "••••" : hint;
}

/** Normalise un identifiant de modèle (texte libre, borné par le use case). */
export function normalizeAiModel(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
