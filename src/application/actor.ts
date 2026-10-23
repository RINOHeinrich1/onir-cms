import { ForbiddenError, NoOrganizationError } from "@/application/errors";
import type { Role } from "@/domain/entities/user";
import { type Action, can } from "@/domain/rbac";

/**
 * Acteur authentifié (identité + organisation active + rôle effectif).
 * ADR-0025 : le rôle vient de la membership active ; le super-admin dispose
 * d'un override explicite. Un acteur sans organisation n'a aucune permission
 * métier (sauf super-admin pour l'administration des organisations).
 */
export type Actor = {
  id: string;
  /** Rôle de la membership active ; `null` si aucune organisation active. */
  role: Role | null;
  /** Organisation active (jamais fournie par le client). */
  organizationId: string | null;
  isSuperAdmin: boolean;
  /** Organisation active suspendue : aucune donnée métier accessible. */
  organizationSuspended?: boolean;
};

/** Autorisation effective : override super-admin, sinon matrice sur le rôle actif. */
export function actorCan(actor: Actor, action: Action): boolean {
  // Une organisation suspendue ne donne accès à aucune donnée métier ; seules
  // la consultation/administration des organisations reste possible.
  if (actor.organizationSuspended === true) {
    return action === "organizations:list" || action === "organizations:read";
  }
  if (actor.isSuperAdmin) return true;
  if (actor.role === null || actor.organizationId === null) {
    // État « aucune organisation » : seule la page d'information reste accessible.
    return action === "organizations:list" || action === "organizations:read";
  }
  return can(actor.role, action);
}

/**
 * Organisation active obligatoire pour toute opération métier.
 * Super-admin sans organisation active : impossible en pratique (le login
 * sélectionne toujours une organisation), mais on échoue explicitement.
 */
export function organizationOf(actor: Actor): string {
  if (actor.organizationId === null) {
    throw new NoOrganizationError();
  }
  return actor.organizationId;
}

/** Vérifie l'autorisation ou lève `ForbiddenError` (matrice RBAC unique). */
export function assertCan(actor: Actor, action: Action): void {
  if (!actorCan(actor, action)) {
    const role = actor.role ?? "sans organisation";
    throw new ForbiddenError(`Action non autorisée pour le rôle « ${role} » : ${action}`);
  }
}

/** Garde explicite super-admin (import de templates visuels, suspension…). */
export function assertSuperAdmin(actor: Actor): void {
  if (!actor.isSuperAdmin) {
    throw new ForbiddenError("Action réservée au super-administrateur");
  }
}
