import type { Connaissance } from "@/domain/entities/connaissance";

export type CreateConnaissanceInput = {
  titre: string;
  contenu: string;
  chatLinkIds: string[];
  createdBy: string | null;
  origin?: "manual" | "ai";
};

export type UpdateConnaissanceInput = {
  titre?: string;
  contenu?: string;
  chatLinkIds?: string[];
  actif?: boolean;
};

export interface ConnaissanceRepository {
  findById(organizationId: string, id: string): Promise<Connaissance | null>;
  /** Recherche par titre (insensible à la casse) pour la garde d'unicité. */
  findByTitre(organizationId: string, titre: string): Promise<Connaissance | null>;
  list(organizationId: string): Promise<Connaissance[]>;
  /** Entrées actives rattachées à un chatbot config-only (chat_link_ids + globales). */
  listActivesForChatLink?(organizationId: string, chatLinkId: string): Promise<Connaissance[]>;
  /**
   * Mode `selected` : globales explicitement sélectionnées + entrées déjà
   * scopées à ce chatbot. Les globales non sélectionnées sont exclues.
   */
  listActivesForChatLinkSelection?(
    organizationId: string,
    chatLinkId: string,
    globalIds: string[],
  ): Promise<Connaissance[]>;
  create(organizationId: string, input: CreateConnaissanceInput): Promise<Connaissance>;
  update(
    organizationId: string,
    id: string,
    patch: UpdateConnaissanceInput,
  ): Promise<Connaissance | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
  /** Suppression groupée, retourne le nombre réellement supprimé. */
  deleteMany(organizationId: string, ids: string[]): Promise<number>;
}
