import type { Actor } from "@/application/actor";
import type { MembershipRole, Organization } from "@/domain/entities/organization";
import type { Role, User } from "@/domain/entities/user";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository, type Session } from "@/infrastructure/db/session-repository";
import { readSessionToken } from "@/infrastructure/session/cookie";
import { hashSessionToken } from "@/lib/session-token";

/** Contexte serveur résolu : user + session + organisation active + rôle effectif. */
export type SessionContextData = {
  session: Session;
  user: User;
  organization: Organization | null;
  role: Role | null;
  actor: Actor;
};

/**
 * Résout le contexte authentifié depuis le cookie de session (server components).
 * L'organisation active vient de la **session serveur** (ADR-0025 §4) ; le rôle
 * effectif est celui de la membership active, avec override super-admin.
 * Retourne `null` si absent, invalide, expiré ou compte inactif.
 */
export async function getSessionContext(): Promise<SessionContextData | null> {
  const token = await readSessionToken();
  if (token === undefined) return null;

  const sessions = pgSessionRepository(getPool());
  const found = await sessions.findByTokenHash(hashSessionToken(token));
  if (found === null) return null;

  if (new Date(found.session.expiresAt).getTime() <= Date.now()) {
    await sessions.delete(found.session.tokenHash);
    return null;
  }
  if (!found.user.actif) return null;

  let role: MembershipRole | null = null;
  if (found.session.activeOrganizationId !== null) {
    role = await pgMembershipRepository(getPool()).findRole(
      found.session.activeOrganizationId,
      found.user.id,
    );
  }
  // Super-admin sans membership explicite : rôle d'affichage « admin ».
  const effectiveRole: Role | null = role ?? (found.user.isSuperAdmin ? "admin" : null);

  const actor: Actor = {
    id: found.user.id,
    role: effectiveRole,
    organizationId: found.session.activeOrganizationId,
    isSuperAdmin: found.user.isSuperAdmin,
    organizationSuspended: found.organization?.suspendedAt !== null && found.organization !== null,
  };

  return {
    session: found.session,
    user: found.user,
    organization: found.organization,
    role: effectiveRole,
    actor,
  };
}

/** Acteur courant (ou `null`). */
export async function getCurrentActor(): Promise<Actor | null> {
  const context = await getSessionContext();
  return context?.actor ?? null;
}

/**
 * Compatibilité des pages qui n'ont besoin que de l'identité
 * (change-password). Les pages de données utilisent `getCurrentActor`.
 */
export async function getCurrentUser(): Promise<User | null> {
  const context = await getSessionContext();
  return context?.user ?? null;
}
