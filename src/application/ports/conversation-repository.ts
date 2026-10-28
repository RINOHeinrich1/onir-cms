import type {
  ChatMessage,
  ChatMessageMedia,
  ChatMessageRole,
  Conversation,
  ConversationFilter,
  ConversationInterventionMode,
  StatutConversation,
  VisitorContact,
} from "@/domain/entities/chat";

export type CreateConversationInput = {
  linkId: string;
  visitorNom: string;
  visitorEmail: string;
  visitorContacts: VisitorContact[];
  /** Prospect rattaché (null si inconnu). */
  prospectId: string | null;
  /** Date du consentement à la confidentialité (null si non requis). */
  consentementAt: string | null;
  /** Politique de confidentialité acceptée. */
  confidentialiteId: string | null;
  channel?: "page" | "widget";
  /** Configuration chatbot utilisée (ADR-0049). */
  configId?: string | null;
};

/** Compteurs de conversations actives (non archivées), par statut. */
export type ConversationStatusCounts = {
  enCours: number;
  finalisees: number;
};

/** Ligne enrichie pour la liste des conversations (US-CONVERS-001). */
export type ConversationSummary = {
  id: string;
  visitorNom: string;
  visitorEmail: string;
  linkId: string;
  linkLabel: string;
  linkType: string;
  prospectId: string | null;
  statut: StatutConversation;
  messageCount: number;
  lastMessageAt: string | null;
  archivee: boolean;
  createdAt: string;
  /** Mode IA/humain (ADR-0043). */
  interventionMode: ConversationInterventionMode;
  /** Opérateur en charge (null en mode IA). */
  assignedOperatorId: string | null;
  assignedOperatorName: string | null;
  /** Dernier opérateur intervenu (conservé après retour à l'IA). */
  lastOperatorName: string | null;
  /** Vrai si un visiteur attend une réponse humaine. */
  awaitingOperator: boolean;
};

export interface ConversationRepository {
  findById(
    organizationId: string,
    id: string,
    /** Périmètre de liens (ADR-0043) ; null/absent = tous les liens. */
    allowedLinkIds?: string[] | null,
  ): Promise<Conversation | null>;
  /**
   * Résolution par identifiant seul — **parcours public uniquement**.
   * L'UUID de conversation est la capability ; l'organisation est ensuite
   * dérivée de la ligne et toutes les opérations suivantes sont scopées.
   */
  findByIdPublic(id: string): Promise<Conversation | null>;
  /** Conversation `en_cours` la plus récente pour (lien, prospect) — reprise. */
  findOpenByLinkAndProspect(
    organizationId: string,
    linkId: string,
    prospectId: string,
    channel?: "page" | "widget",
  ): Promise<Conversation | null>;
  /** Liste enrichie filtrée par statut (filtre serveur). */
  listWithDetails(
    organizationId: string,
    filter: ConversationFilter,
    linkLabel?: string | string[] | null,
    /** Périmètre de liens (ADR-0043) ; null/absent = tous les liens. */
    allowedLinkIds?: string[] | null,
  ): Promise<ConversationSummary[]>;
  /** Compte les conversations non archivées par statut, scopé organisation. */
  countByStatut(organizationId: string): Promise<ConversationStatusCounts>;
  create(organizationId: string, input: CreateConversationInput): Promise<Conversation>;
  /** Passe la conversation au statut `finalisee`. */
  markFinalisee(organizationId: string, id: string): Promise<void>;
  /** Archive / désarchive une conversation ; false si introuvable. */
  setArchivee(organizationId: string, id: string, archivee: boolean): Promise<boolean>;
  appendMessage(
    organizationId: string,
    conversationId: string,
    role: ChatMessageRole,
    content: string,
    /** Pièces à rattacher atomiquement au message (ADR-0034). */
    attachmentIds?: string[],
    /** Auteur humain (messages opérateur uniquement). */
    authorUserId?: string | null,
  ): Promise<ChatMessage>;
  /** Message opérateur + prise en main atomiques (ADR-0043). */
  appendOperatorMessage(
    organizationId: string,
    conversationId: string,
    content: string,
    authorUserId: string,
  ): Promise<{ message: ChatMessage; conversation: Conversation } | null>;
  /** Prend la main sans envoyer de message ; null si introuvable/finalisée. */
  takeOverConversation(
    organizationId: string,
    conversationId: string,
    userId: string,
  ): Promise<Conversation | null>;
  /** Rend la main à l'IA ; null si introuvable. */
  releaseConversation(organizationId: string, conversationId: string): Promise<Conversation | null>;
  /** Messages strictement postérieurs à `after` (SSE/polling). */
  listMessagesAfter(
    organizationId: string,
    conversationId: string,
    after: string | null,
  ): Promise<ChatMessage[]>;
  findMessage(organizationId: string, id: string): Promise<ChatMessage | null>;
  listMessages(organizationId: string, conversationId: string): Promise<ChatMessage[]>;
  /** Renseigne les médias d'un message (NULL = non calculé côté base). */
  setMessageMedias(
    organizationId: string,
    messageId: string,
    medias: ChatMessageMedia[],
  ): Promise<ChatMessage | null>;
  listByLink(organizationId: string, linkId: string): Promise<Conversation[]>;
  /** Fixe la configuration courante de la conversation (ADR-0049). */
  setConfig?(
    organizationId: string,
    id: string,
    configId: string,
    activeFicheInstanceId?: string | null,
  ): Promise<void>;
  /** Enregistre le résultat de la clôture (ADR-0049). */
  setOutcome?(
    organizationId: string,
    id: string,
    outcome: "fiches_creees" | "sans_fiche" | "abandonnee" | "erreur",
  ): Promise<void>;
}
