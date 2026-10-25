import type {
  Attachment,
  CreateAttachmentInput,
  FicheAttachment,
  OrganizationAttachment,
} from "@/domain/entities/attachment";

export interface AttachmentRepository {
  create(organizationId: string, input: CreateAttachmentInput): Promise<Attachment>;
  findById(organizationId: string, id: string): Promise<Attachment | null>;
  /** Résolution par identifiant seul — parcours public (capability UUID). */
  findByIdPublic(id: string): Promise<Attachment | null>;
  listByConversation(organizationId: string, conversationId: string): Promise<Attachment[]>;
  listByIds(organizationId: string, conversationId: string, ids: string[]): Promise<Attachment[]>;
  countForField(organizationId: string, conversationId: string, fieldName: string): Promise<number>;
  /** Supprime une pièce non envoyée (message_id NULL). False sinon/introuvable. */
  deletePending(organizationId: string, id: string): Promise<boolean>;
  listByFiche(organizationId: string, ficheId: string): Promise<FicheAttachment[]>;
  /** Liste globale des pièces d'une organisation (onglet Fichiers des leads). */
  listForOrganization(organizationId: string, limit?: number): Promise<OrganizationAttachment[]>;
  attachToFiche(
    organizationId: string,
    ficheId: string,
    attachments: readonly Attachment[],
  ): Promise<void>;
}
