import { type Actor, assertSuperAdmin } from "@/application/actor";
import { ConflictError, ValidationError } from "@/application/errors";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import { defaultOrganizationName, type Organization } from "@/domain/entities/organization";

const NAME_MAX = 120;

export type CreateOrganizationDependencies = {
  organizations: OrganizationRepository;
  users: UserRepository;
};

export type CreateOrganizationCommand = {
  name?: unknown;
};

/**
 * ADR-0025 §2/§5/§7 — création d'une organisation (super-admin uniquement).
 * Le nom est prérempli avec la partie locale de l'email du créateur, puis
 * reste éditable. L'organisation est immédiatement provisionnée.
 */
export async function createOrganization(
  deps: CreateOrganizationDependencies,
  actor: Actor,
  input: CreateOrganizationCommand,
): Promise<Organization> {
  assertSuperAdmin(actor);

  const raw = typeof input.name === "string" ? input.name.trim() : "";
  let name = raw;
  if (name === "") {
    const creator = await deps.users.findById(actor.id);
    name = defaultOrganizationName(creator?.email ?? "");
  }
  if (name.length > NAME_MAX) {
    throw new ValidationError(`Nom trop long (${NAME_MAX} caractères maximum)`);
  }

  const existing = await deps.organizations.findByName(name);
  if (existing !== null) {
    throw new ConflictError("Une organisation porte déjà ce nom");
  }

  const organization = await deps.organizations.create({ name, createdBy: actor.id });
  await deps.organizations.provisionDefaults(organization.id);
  return organization;
}
