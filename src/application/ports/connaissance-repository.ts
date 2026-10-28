import type { Connaissance } from "@/domain/entities/connaissance";

export type CreateConnaissanceInput = {
  titre: string;
  contenu: string;
  templateKeys: string[];
  createdBy: string | null;
  origin?: "manual" | "ai";
  sourceTemplateKey?: string | null;
  aiGenerationId?: string | null;
};

export type UpdateConnaissanceInput = {
  titre?: string;
  contenu?: string;
  templateKeys?: string[];
  actif?: boolean;
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
