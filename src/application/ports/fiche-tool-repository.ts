import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type {
  FicheSearchOperator,
  FicheSortMode,
  FicheStatusMode,
} from "@/domain/fiche-search-tool";

/** Condition normalisée (type et valeur déjà validés par le domaine). */
export type FicheToolCondition = {
  field: string;
  operator: FicheSearchOperator;
  value?: unknown;
};

/** Périmètre inviolable d'une recherche : organisation + chatbot. */
export type FicheToolScope = {
  organizationId: string;
  chatLinkId: string;
};

export type FicheToolFilters = FicheToolScope & {
  /** Types réellement interrogeables (champs filtrés présents dans chacun). */
  ficheTypes: string[];
  conditions: FicheToolCondition[];
  query: string | null;
  createdFrom: string | null;
  createdTo: string | null;
  statusMode: FicheStatusMode;
  fixedStatusKeys: string[];
};

export type FicheToolSearchCriteria = FicheToolFilters & {
  /** Définitions par type : sert à construire les expressions JSONB typées. */
  definitions: Readonly<Record<string, TemplateDefinition>>;
  sortMode: FicheSortMode;
  /** Graine de rotation équitable (identifiant de conversation). */
  conversationId: string | null;
  limit: number;
  offset: number;
};

export type FicheToolRow = {
  id: string;
  definition: TemplateDefinition | null;
  data: Record<string, unknown>;
  qualificationStatusKey: string | null;
  createdAt: string;
};

export type FicheToolSearchResult = {
  /** Liste ordonnée stable (rotation déjà appliquée). */
  ids: string[];
  total: number;
};

export type FicheToolLookup = FicheToolScope & {
  ficheTypes: string[];
  statusMode: FicheStatusMode;
  fixedStatusKeys: string[];
  ficheId: string;
};

export interface FicheToolRepository {
  /** Liste ordonnée des identifiants scopés, bornée à MAX_SESSION_RESULTS + 1. */
  searchScoped(criteria: FicheToolSearchCriteria): Promise<FicheToolSearchResult>;
  /** Compte les fiches scopées avec les mêmes filtres, sans tri ni pagination. */
  countScoped(
    criteria: Omit<FicheToolSearchCriteria, "sortMode" | "conversationId" | "limit" | "offset">,
  ): Promise<number>;
  /** Relit une fiche courante dans le périmètre (archivée ou hors scope ⇒ null). */
  findScopedById(lookup: FicheToolLookup): Promise<FicheToolRow | null>;
}
