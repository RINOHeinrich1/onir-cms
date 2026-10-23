import type { Confidentialite, ConfidentialiteInput } from "@/domain/entities/confidentialite";

export interface ConfidentialiteRepository {
  findById(organizationId: string, id: string): Promise<Confidentialite | null>;
  /** Recherche par titre (insensible à la casse) — unicité. */
  findByTitre(organizationId: string, titre: string): Promise<Confidentialite | null>;
  list(organizationId: string): Promise<Confidentialite[]>;
  /** Politiques actives (sélection d'un lien de chat). */
  listActives(organizationId: string): Promise<Confidentialite[]>;
  create(
    organizationId: string,
    input: ConfidentialiteInput & { createdBy: string | null },
  ): Promise<Confidentialite>;
  update(
    organizationId: string,
    id: string,
    patch: Partial<ConfidentialiteInput>,
  ): Promise<Confidentialite | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
