import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { type Actor, actorCan } from "@/application/actor";
import {
  ForbiddenError,
  OrganizationSuspendedError,
  UnauthorizedError,
} from "@/application/errors";
import type { Organization } from "@/domain/entities/organization";
import type { Role, User } from "@/domain/entities/user";
import type { Action } from "@/domain/rbac";
import { SESSION_COOKIE } from "@/domain/session";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository, type Session } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { platformApiKey, platformApiUserId } from "@/lib/env";
import { hashSessionToken } from "@/lib/session-token";

/** Contexte d'une requête HTTP authentifiée (session + organisation active). */
export type RequestSession = {
  session: Session;
  user: User;
  organization: Organization | null;
  role: Role | null;
  actor: Actor;
};

/**
 * Garde HTTP (A032, étendu ADR-0025) : charge la session, vérifie expiration et
 * compte actif, résout l'organisation active et le rôle effectif de la
 * membership. Lève 401/403, jamais 500.
 */
export async function requireUser(_request: Request): Promise<RequestSession> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    throw new UnauthorizedError();
  }

  const sessions = pgSessionRepository(getPool());
  const found = await sessions.findByTokenHash(hashSessionToken(token));
  if (found === null) {
    throw new UnauthorizedError("Session invalide");
  }
  if (new Date(found.session.expiresAt).getTime() <= Date.now()) {
    await sessions.delete(found.session.tokenHash);
    throw new UnauthorizedError("Session expirée");
  }
  if (!found.user.actif) {
    throw new ForbiddenError("Compte désactivé");
  }

  let role: Role | null = null;
  if (found.session.activeOrganizationId !== null) {
    role = await pgMembershipRepository(getPool()).findRole(
      found.session.activeOrganizationId,
      found.user.id,
    );
  }
  const effectiveRole: Role | null = role ?? (found.user.isSuperAdmin ? "admin" : null);
  const actor: Actor = {
    id: found.user.id,
    role: effectiveRole,
    organizationId: found.session.activeOrganizationId,
    isSuperAdmin: found.user.isSuperAdmin,
    organizationSuspended: found.organization !== null && found.organization.suspendedAt !== null,
  };

  return {
    session: found.session,
    user: found.user,
    organization: found.organization,
    role: effectiveRole,
    actor,
  };
}

/** Garde HTTP + autorisation RBAC sur une action précise (rôle de membership). */
export async function requireRole(request: Request, action: Action): Promise<Actor> {
  const { actor } = await requireUser(request);
  if (actor.organizationSuspended === true) {
    throw new OrganizationSuspendedError();
  }
  if (!actorCan(actor, action)) {
    throw new ForbiddenError(`Action non autorisée : ${action}`);
  }
  return actor;
}

/** Garde HTTP + flag super-admin (administration plateforme). */
export async function requireSuperAdmin(request: Request): Promise<Actor> {
  const { actor } = await requireUser(request);
  if (!actor.isSuperAdmin) {
    throw new ForbiddenError("Action réservée au super-administrateur");
  }
  return actor;
}

function secureEqual(left: string, right: string): boolean {
  const a = createHash("sha256").update(left).digest();
  const b = createHash("sha256").update(right).digest();
  return timingSafeEqual(a, b);
}

/**
 * Auth plateforme : clé Bearer pour les appels serveur-à-serveur, avec repli
 * sur la session super-admin pour les écrans historiques du backoffice.
 */
export async function requirePlatformAdmin(request: Request): Promise<Actor> {
  const expected = platformApiKey();
  const userId = platformApiUserId();
  const authorization = request.headers.get("authorization") ?? "";
  if (authorization.startsWith("Bearer ")) {
    if (expected === undefined || userId === undefined) {
      throw new UnauthorizedError("API plateforme non configurée");
    }
    if (!secureEqual(authorization.slice("Bearer ".length), expected)) {
      throw new UnauthorizedError("Clé API plateforme invalide");
    }
    const user = await pgUserRepository(getPool()).findById(userId);
    if (user === null || !user.actif || !user.isSuperAdmin) {
      throw new UnauthorizedError("Compte de service plateforme invalide");
    }
    return {
      id: user.id,
      role: "admin",
      organizationId: null,
      isSuperAdmin: true,
      organizationSuspended: false,
    };
  }
  return requireSuperAdmin(request);
}
