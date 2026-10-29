import type { FicheCollecte, FicheCollecteInput } from "@/domain/entities/fiche-collecte";

export type FicheCollecteVersion = FicheCollecteInput & {
  id: string;
  ficheCollecteId: string;
  version: number;
  createdBy: string | null;
  createdAt: string;
};

export interface FicheCollecteRepository {
  list(organizationId: string): Promise<FicheCollecte[]>;
  findById(organizationId: string, id: string): Promise<FicheCollecte | null>;
  findByKey(organizationId: string, key: string): Promise<FicheCollecte | null>;
  create(
    organizationId: string,
    input: FicheCollecteInput,
    createdBy: string | null,
  ): Promise<FicheCollecte>;
  /** Crée une nouvelle version immuable et met à jour la fiche courante. */
  updateVersion(
    organizationId: string,
    id: string,
    input: FicheCollecteInput,
    createdBy: string | null,
  ): Promise<FicheCollecte | null>;
  listVersions(organizationId: string, id: string): Promise<FicheCollecteVersion[]>;
  findVersion(
    organizationId: string,
    id: string,
    version: number,
  ): Promise<FicheCollecteVersion | null>;
  delete(organizationId: string, id: string): Promise<boolean>;
}
