import { type Actor, assertSuperAdmin } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { Organization } from "@/domain/entities/organization";

export type SuspendOrganizationDependencies = {
  organizations: OrganizationRepository;
};

/** ADR-0025 §5 — suspension d'une organisation (super-admin uniquement). */
export async function suspendOrganization(
  deps: SuspendOrganizationDependencies,
  actor: Actor,
  id: string,
): Promise<Organization> {
  assertSuperAdmin(actor);
  const updated = await deps.organizations.setSuspended(id, true);
  if (updated === null) {
    throw new NotFoundError("Organisation introuvable");
  }
  return updated;
}

/** ADR-0025 §5 — réactivation d'une organisation (super-admin uniquement). */
export async function reactivateOrganization(
  deps: SuspendOrganizationDependencies,
  actor: Actor,
  id: string,
): Promise<Organization> {
  assertSuperAdmin(actor);
  const updated = await deps.organizations.setSuspended(id, false);
  if (updated === null) {
    throw new NotFoundError("Organisation introuvable");
  }
  return updated;
}
