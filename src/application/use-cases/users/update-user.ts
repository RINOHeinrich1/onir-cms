import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "@/application/errors";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { UpdateUserInput, UserRepository } from "@/application/ports/user-repository";
import { type MemberDto, toMember } from "@/application/use-cases/organizations/manage-members";
import type { Role } from "@/domain/entities/user";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/domain/password";

export type UpdateUserCommand = {
  role?: Role;
  actif?: boolean;
  password?: string;
};

export type UpdateUserDependencies = {
  users: UserRepository;
  memberships: MembershipRepository;
};

/**
 * US-USERS-001 / ADR-0025 §3 + H4 — mise à jour scoped.
 * Le rôle est écrit dans la membership active ; `actif` est global et réservé
 * au super-admin ; le mot de passe est global. Une cible hors organisation
 * est traitée comme inexistante (404).
 */
export async function updateUser(
  deps: UpdateUserDependencies,
  actor: Actor,
  id: string,
  patch: UpdateUserCommand,
): Promise<MemberDto> {
  assertCan(actor, "users:update");
  const organizationId = organizationOf(actor);

  const membership = await deps.memberships.findByOrganizationAndUser(organizationId, id);
  if (membership === null) {
    throw new NotFoundError("Utilisateur introuvable");
  }

  if (patch.actif !== undefined && !actor.isSuperAdmin) {
    throw new ForbiddenError("Seul le super-administrateur peut activer/désactiver un compte");
  }

  if (patch.role !== undefined && patch.role !== membership.role) {
    if (membership.role === "admin") {
      const admins = await deps.memberships.countAdmins(organizationId);
      if (admins <= 1) {
        throw new ConflictError(
          "Impossible de retirer le dernier administrateur de l'organisation",
        );
      }
    }
    await deps.memberships.updateRole(organizationId, id, patch.role);
  }

  const update: UpdateUserInput = {};
  if (patch.role !== undefined) update.role = patch.role;
  if (patch.actif !== undefined) update.actif = patch.actif;
  if (patch.password !== undefined) {
    if (patch.password.length < MIN_PASSWORD_LENGTH) {
      throw new ValidationError(
        `Mot de passe trop court (${MIN_PASSWORD_LENGTH} caractères minimum)`,
      );
    }
    update.passwordHash = hashPassword(patch.password);
    update.mustChangePassword = true;
  }

  const updated = await deps.users.update(id, update);
  if (updated === null) {
    throw new NotFoundError("Utilisateur introuvable");
  }
  const activeMembership = await deps.memberships.findByOrganizationAndUser(organizationId, id);
  return toMember(updated, activeMembership?.role ?? membership.role);
}
