import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, ForbiddenError, NotFoundError } from "@/application/errors";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { SessionRepository } from "@/application/ports/session-repository";

export type DeleteUserDependencies = {
  memberships: MembershipRepository;
  sessions: SessionRepository;
};

/**
 * US-USERS-001 / ADR-0025 §5 + H5 — suppression scoped = **retrait de
 * membership**. Le compte global n'est jamais supprimé (il peut appartenir à
 * d'autres organisations). Les sessions sont révoquées seulement si le compte
 * n'a plus aucune organisation.
 */
export async function deleteUser(
  deps: DeleteUserDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "users:delete");
  const organizationId = organizationOf(actor);

  if (actor.id === id) {
    throw new ForbiddenError("Impossible de retirer son propre compte");
  }

  const membership = await deps.memberships.findByOrganizationAndUser(organizationId, id);
  if (membership === null) {
    throw new NotFoundError("Utilisateur introuvable");
  }

  if (membership.role === "admin") {
    const admins = await deps.memberships.countAdmins(organizationId);
    if (admins <= 1) {
      throw new ConflictError("Impossible de retirer le dernier administrateur");
    }
  }

  await deps.memberships.remove(organizationId, id);
  const remaining = await deps.memberships.countForUser(id);
  if (remaining === 0) {
    await deps.sessions.deleteByUser(id);
  }
}
