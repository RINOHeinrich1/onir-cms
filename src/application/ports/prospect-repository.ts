import type {
  NatureProspect,
  OrigineProspect,
  Prospect,
  ProspectOriginFilter,
} from "@/domain/entities/prospect";

export type CreateProspectInput = {
  nom: string;
  prenom: string;
  nature: NatureProspect;
  email: string;
  activite: string;
  fonction: string;
  detail: string;
  createdBy: string | null;
  /** Origine (`saisie` par défaut). */
  origine?: OrigineProspect;
  /** Lien de chat d'entrée (prospects `libre`). */
  lienId?: string | null;
};

export type UpdateProspectInput = {
  nom?: string;
  prenom?: string;
  nature?: NatureProspect;
  email?: string;
  activite?: string;
  fonction?: string;
  detail?: string;
};

export interface ProspectRepository {
  findById(organizationId: string, id: string): Promise<Prospect | null>;
  /** Recherche par email (insensible à la casse) — identification chat. */
  findByEmail(organizationId: string, email: string): Promise<Prospect | null>;
  list(organizationId: string, filter?: ProspectOriginFilter | null): Promise<Prospect[]>;
  /** Libellés distincts des liens ayant au moins un prospect `libre`. */
  listLinkLabels(organizationId: string): Promise<string[]>;
  create(organizationId: string, input: CreateProspectInput): Promise<Prospect>;
  update(organizationId: string, id: string, patch: UpdateProspectInput): Promise<Prospect | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
