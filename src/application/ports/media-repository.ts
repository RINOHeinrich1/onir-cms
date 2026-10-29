import type { Media, TypeMedia } from "@/domain/entities/media";

export type CreateMediaInput = {
  type: TypeMedia;
  libelle: string;
  description: string;
  chatLinkIds: string[];
  actif: boolean;
  /** Photo : clé de stockage ; lien : null. */
  fichier: string | null;
  /** Photo : type MIME ; lien : null. */
  mime: string | null;
  /** Lien : URL externe ; photo : null. */
  url: string | null;
  createdBy: string | null;
  /** @deprecated Compatibilité legacy uniquement (anciens chatbots). */
  legacyTemplateKeys?: string[];
};

export type UpdateMediaInput = {
  libelle?: string;
  description?: string;
  chatLinkIds?: string[];
  actif?: boolean;
  url?: string;
  /** @deprecated Compatibilité legacy uniquement (anciens chatbots). */
  legacyTemplateKeys?: string[];
};

export interface MediaRepository {
  findById(organizationId: string, id: string): Promise<Media | null>;
  /** Résolution par identifiant seul — route fichier publique (signature requise). */
  findByIdPublic(id: string): Promise<Media | null>;
  /** Recherche par libellé (insensible à la casse) au sein d'une nature (unicité). */
  findByLibelle(organizationId: string, type: TypeMedia, libelle: string): Promise<Media | null>;
  list(organizationId: string): Promise<Media[]>;
  /** Médias actifs d'une nature visibles par un modèle (globaux + restreints). */
  listActivesByType(organizationId: string, type: TypeMedia, templateKey: string): Promise<Media[]>;
  /** Médias actifs rattachés à un chatbot config-only (chat_link_ids + globaux). */
  listActivesByTypeForChatLink?(
    organizationId: string,
    type: TypeMedia,
    chatLinkId: string,
  ): Promise<Media[]>;
  /**
   * Mode `selected` : médias globaux explicitement sélectionnés + médias déjà
   * scopés à ce chatbot. Les globaux non sélectionnés sont exclus.
   */
  listActivesByTypeForChatLinkSelection?(
    organizationId: string,
    type: TypeMedia,
    chatLinkId: string,
    globalIds: string[],
  ): Promise<Media[]>;
  create(organizationId: string, input: CreateMediaInput): Promise<Media>;
  update(organizationId: string, id: string, patch: UpdateMediaInput): Promise<Media | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
