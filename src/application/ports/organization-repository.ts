import type { Organization } from "@/domain/entities/organization";

export type CreateOrganizationInput = {
  name: string;
  createdBy: string | null;
};

/**
 * Port de persistance des organisations (ADR-0025).
 * `provisionDefaults` clone les défauts (modèles, politique, templates visuels)
 * de façon idempotente (ADR-0025 §7/§9).
 */
export interface OrganizationRepository {
  create(input: CreateOrganizationInput): Promise<Organization>;
  findById(id: string): Promise<Organization | null>;
  findByName(name: string): Promise<Organization | null>;
  /** Toutes les organisations (super-admin). */
  listAll(): Promise<Organization[]>;
  /** Organisations dont l'utilisateur est membre (sélecteur, login). */
  listForUser(userId: string): Promise<Organization[]>;
  rename(id: string, name: string): Promise<Organization | null>;
  setSuspended(id: string, suspended: boolean): Promise<Organization | null>;
  provisionDefaults(organizationId: string): Promise<void>;
}
