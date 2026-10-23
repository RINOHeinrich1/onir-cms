import { type Actor, assertCan } from "@/application/actor";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { Organization } from "@/domain/entities/organization";

export type ListOrganizationsDependencies = {
  organizations: OrganizationRepository;
};

/**
 * ADR-0025 §5 — le super-admin voit toutes les organisations ; les autres
 * utilisateurs ne voient que celles dont ils sont membres.
 */
export async function listOrganizations(
  deps: ListOrganizationsDependencies,
  actor: Actor,
): Promise<Organization[]> {
  assertCan(actor, "organizations:list");
  return actor.isSuperAdmin
    ? deps.organizations.listAll()
    : deps.organizations.listForUser(actor.id);
}
