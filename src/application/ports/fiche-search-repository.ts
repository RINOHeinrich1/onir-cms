import type { Fiche } from "@/domain/entities/fiche";

export type FicheSearchSort = "asc" | "desc";

export type FicheSearchCursor = {
  createdAt: string;
  id: string;
};

export type FicheSearchCriteria = {
  q: string | null;
  templateKey: string | null;
  templateVersion: number | null;
  createdFrom: string | null;
  createdTo: string | null;
  prospectId: string | null;
  conversationId: string | null;
  linkId: string | null;
  includeArchived: boolean;
  limit: number;
  sort: FicheSearchSort;
  cursor: FicheSearchCursor | null;
};

export type FicheSearchResult = {
  fiches: Fiche[];
  nextCursor: FicheSearchCursor | null;
};

export interface FicheSearchRepository {
  search(organizationId: string, criteria: FicheSearchCriteria): Promise<FicheSearchResult>;
}
