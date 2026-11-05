import type {
  FicheSearchOperator,
  FicheSortMode,
  FicheStatusMode,
} from "@/domain/fiche-search-tool";

/** Critères figés au moment de la recherche (jamais modifiables par continuation). */
export type ChatSearchStoredCriteria = {
  query: string | null;
  ficheTypes: string[];
  conditions: Array<{ field: string; operator: FicheSearchOperator; value?: unknown }>;
  createdFrom: string | null;
  createdTo: string | null;
  statusMode: FicheStatusMode;
  fixedStatusKeys: string[];
  sortMode: FicheSortMode;
};

export type ChatSearchSession = {
  id: string;
  organizationId: string;
  chatLinkId: string;
  conversationId: string;
  criteria: ChatSearchStoredCriteria;
  orderedFicheIds: string[];
  total: number;
  offset: number;
  createdAt: string;
  expiresAt: string;
};

export type CreateChatSearchSessionInput = {
  organizationId: string;
  chatLinkId: string;
  conversationId: string;
  criteria: ChatSearchStoredCriteria;
  orderedFicheIds: string[];
  total: number;
  offset: number;
  expiresAt: string;
};

export type ChatSearchSessionScope = {
  organizationId: string;
  chatLinkId: string;
  conversationId: string;
};

export interface ChatSearchSessionRepository {
  /** Crée la session et remplace toute session active de la conversation. */
  create(input: CreateChatSearchSessionInput): Promise<ChatSearchSession>;
  /** Session la plus récente non expirée pour le triplet org/lien/conversation. */
  latestActive(scope: ChatSearchSessionScope & { now?: Date }): Promise<ChatSearchSession | null>;
  updateOffset(
    scope: ChatSearchSessionScope & { sessionId: string; offset: number },
  ): Promise<void>;
  /** Nettoie les sessions expirées et retourne le nombre supprimé. */
  purgeExpired(now?: Date): Promise<number>;
}
