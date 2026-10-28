import type {
  ConversationFicheInstance,
  FicheInstanceStatus,
} from "@/domain/entities/conversation-fiche-instance";

export type UpsertFicheInstanceInput = {
  organizationId: string;
  conversationId: string;
  configId: string;
  ficheKey: string;
  /** Clé d'instance (plusieurs instances d'une même fiche) ; défaut `default`. */
  instanceKey?: string;
  status: FicheInstanceStatus;
  data?: Record<string, unknown>;
  missingFields?: string[];
  abandonReason?: string | null;
  completed?: boolean;
};

export interface ConversationFicheInstanceRepository {
  listByConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationFicheInstance[]>;

  findById(organizationId: string, id: string): Promise<ConversationFicheInstance | null>;

  /** Crée ou met à jour l'instance (conversation, fiche, instanceKey). */
  upsert(input: UpsertFicheInstanceInput): Promise<ConversationFicheInstance>;

  /** Met à jour le statut/données d'une instance existante. */
  update(
    organizationId: string,
    id: string,
    patch: {
      status?: FicheInstanceStatus;
      data?: Record<string, unknown>;
      missingFields?: string[];
      abandonReason?: string | null;
      completed?: boolean;
    },
  ): Promise<ConversationFicheInstance | null>;

  /**
   * Active une instance : les autres instances `active` de la conversation
   * passent en `paused`, puis l'instance ciblée devient `active`.
   */
  activate(
    organizationId: string,
    conversationId: string,
    instanceId: string,
  ): Promise<ConversationFicheInstance | null>;
}
