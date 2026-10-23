import type { Connaissance } from "@/domain/entities/connaissance";

export type CreateConnaissanceInput = {
  titre: string;
  contenu: string;
  templateKeys: string[];
  createdBy: string | null;
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
  create(organizationId: string, input: CreateConnaissanceInput): Promise<Connaissance>;
  update(
    organizationId: string,
    id: string,
    patch: UpdateConnaissanceInput,
  ): Promise<Connaissance | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
