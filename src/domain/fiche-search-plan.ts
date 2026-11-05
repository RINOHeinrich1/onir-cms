/**
 * Plan de recherche structuré produit avant `search_fiches`.
 *
 * Le plan ne contient jamais de SQL : il décrit une query libre et/ou des
 * conditions sémantiques sur les champs réels des fiches de collecte. La
 * validation finale reste celle de `validateSearchRequest`.
 */

import type { FicheSearchCondition, FicheSearchToolConfig } from "@/domain/fiche-search-tool";
import type {
  SearchableFicheDefinition,
  ValidatedFicheSearchRequest,
} from "@/domain/fiche-search-validation";
import { validateSearchRequest } from "@/domain/fiche-search-validation";

export type FicheSearchPlan = {
  query?: string;
  conditions?: FicheSearchCondition[];
  limit?: number;
};

export type FicheSearchPlanValidation =
  | { ok: true; value: ValidatedFicheSearchRequest }
  | { ok: false; errors: string[] };

export function validateFicheSearchPlan(
  plan: FicheSearchPlan,
  definitions: readonly SearchableFicheDefinition[],
  config: FicheSearchToolConfig,
): FicheSearchPlanValidation {
  const byType: Record<string, SearchableFicheDefinition> = {};
  for (const definition of definitions) byType[definition.key] = definition;
  return validateSearchRequest(plan, byType, config);
}

export function broadFicheSearchPlan(limit = 5): FicheSearchPlan {
  return { query: "", conditions: [], limit };
}
