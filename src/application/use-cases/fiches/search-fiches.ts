import type {
  FicheSearchCriteria,
  FicheSearchRepository,
  FicheSearchResult,
} from "@/application/ports/fiche-search-repository";

export async function searchFiches(
  deps: { fiches: FicheSearchRepository },
  organizationId: string,
  criteria: FicheSearchCriteria,
): Promise<FicheSearchResult> {
  return deps.fiches.search(organizationId, criteria);
}
