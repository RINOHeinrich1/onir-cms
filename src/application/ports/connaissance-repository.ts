import type { Connaissance } from "@/domain/entities/connaissance";

export type CreateConnaissanceInput = {
  titre: string;
  contenu: string;
  chatLinkIds: string[];
  createdBy: string | null;
  origin?: "manual" | "ai";
  sourceTemplateKey?: string | null;
  aiGenerationId?: string | null;
  /**
   * @deprecated Compatibilité legacy uniquement : la colonne `template_keys`
   * reste alimentée pour les anciens chatbots. Ne pas exposer dans l'UI.
   */
  legacyTemplateKeys?: string[];
};

export type UpdateConnaissanceInput = {
  titre?: string;
  contenu?: string;
  chatLinkIds?: string[];
  actif?: boolean;
  /** @deprecated Compatibilité legacy uniquement (anciens chatbots). */
  legacyTemplateKeys?: string[];
};

export interface ConnaissanceRepository {
  findById(organizationId: string, id: string): Promise<Connaissance | null>;
  /** Recherche par titre (insensible à la casse) pour la garde d'unicité. */
  findByTitre(organizationId: string, titre: string): Promise<Connaissance | null>;
  list(organizationId: string): Promise<Connaissance[]>;
  /** Entrées actives visibles par un modèle (globales + restreintes), récentes d'abord. */
  listActives(organizationId: string, templateKey: string): Promise<Connaissance[]>;
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
  /** Nombre de connaissances IA générées pour un modèle (provenance). */
  countAiByTemplate(organizationId: string, templateKey: string): Promise<number>;
  update(
    organizationId: string,
    id: string,
    patch: UpdateConnaissanceInput,
  ): Promise<Connaissance | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
