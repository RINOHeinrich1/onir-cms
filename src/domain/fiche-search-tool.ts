/**
 * Contrat interne des outils de recherche de fiches (ADR-0067 §4).
 * Les outils sont en lecture seule : ils ne créent, ne modifient et ne
 * suppriment jamais de fiche. Le modèle ne fournit qu'un opérateur sémantique,
 * jamais un fragment SQL.
 */

import type { ToolField } from "@/domain/tool-blocks";

export const MAX_CONDITIONS = 12;
export const DEFAULT_LIMIT = 10;
export const MAX_LIMIT = 20;
export const SESSION_TTL_MINUTES = 30;
export const MAX_SESSION_RESULTS = 500;
export const MAX_QUERY_LENGTH = 500;

export const FICHE_SEARCH_OPERATORS = [
  "eq",
  "neq",
  "contains",
  "starts_with",
  "ends_with",
  "in",
  "not_in",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "exists",
  "is_empty",
  "contains_any",
  "contains_all",
  "contains_none",
] as const;

export type FicheSearchOperator = (typeof FICHE_SEARCH_OPERATORS)[number];

export function isFicheSearchOperator(value: unknown): value is FicheSearchOperator {
  return typeof value === "string" && (FICHE_SEARCH_OPERATORS as readonly string[]).includes(value);
}

export const FICHE_STATUS_MODES = ["hidden_fixed", "internal_filter", "all"] as const;
export type FicheStatusMode = (typeof FICHE_STATUS_MODES)[number];

export function isFicheStatusMode(value: unknown): value is FicheStatusMode {
  return typeof value === "string" && (FICHE_STATUS_MODES as readonly string[]).includes(value);
}

export const FICHE_SORT_MODES = ["fair_rotation", "created_at", "relevance"] as const;
export type FicheSortMode = (typeof FICHE_SORT_MODES)[number];

export function isFicheSortMode(value: unknown): value is FicheSortMode {
  return typeof value === "string" && (FICHE_SORT_MODES as readonly string[]).includes(value);
}

/**
 * `relevance` est accepté structurellement pour la compatibilité des
 * configurations, mais n'est pas exécutable dans le MVP (ADR-0067 §4.9).
 */
export function isFicheSortModeExecutable(value: FicheSortMode): boolean {
  return value !== "relevance";
}

export const FICHE_SCOPES = ["chat_link", "organization"] as const;
export type FicheScope = (typeof FICHE_SCOPES)[number];

export function isFicheScope(value: unknown): value is FicheScope {
  return typeof value === "string" && (FICHE_SCOPES as readonly string[]).includes(value);
}

/** Condition sémantique fournie par le modèle (jamais de SQL). */
export type FicheSearchCondition = {
  field: string;
  operator: FicheSearchOperator;
  value?: unknown;
};

/** Entrée de `search_fiches` / `count_fiches`. */
export type FicheSearchRequest = {
  query?: string;
  ficheTypes?: string[];
  conditions?: FicheSearchCondition[];
  createdFrom?: string;
  createdTo?: string;
  limit?: number;
};

/** Politiques versionnées de l'outil (ADR-0067 §4.9). */
export type FicheSearchToolConfig = {
  ficheTypes: string[];
  statusMode: FicheStatusMode;
  fixedStatusKeys: string[];
  sortMode: FicheSortMode;
  scope: FicheScope;
};

/** Élément de résultat : l'identifiant technique reste hors des champs rendus. */
export type FicheToolResultItem = {
  ficheId: string;
  fields: ToolField[];
  /** Uniquement en mode backoffice `internal_filter`, jamais en `hidden_fixed`. */
  statusKey?: string;
};

export type FicheSearchToolResult = {
  items: FicheToolResultItem[];
  total: number;
  hasMore: boolean;
  page: { limit: number; offset: number };
};

export type FicheCountToolResult = {
  total: number;
};

export type FicheTypeToolResult = {
  key: string;
  label: string;
};

/**
 * Hachage déterministe (FNV-1a 32 bits) : même conversation ⇒ même rotation.
 * L'offset est calculé côté application puis passé au SQL, ce qui garantit un
 * ordre identique dans les tests et en base.
 */
export function conversationRotationOffset(conversationId: string, total: number): number {
  if (total <= 0) return 0;
  let hash = 2166136261;
  for (let index = 0; index < conversationId.length; index += 1) {
    hash ^= conversationId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % total;
}

/** Applique la rotation équitable à une liste ordonnée stable d'identifiants. */
export function rotateFicheIds(orderedIds: readonly string[], conversationId: string): string[] {
  const total = orderedIds.length;
  if (total === 0) return [];
  const offset = conversationRotationOffset(conversationId, total);
  return orderedIds.map((_, index) => orderedIds[(index + offset) % total] as string);
}
