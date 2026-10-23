/**
 * Entités tenant (ADR-0025) — pures, sans dépendance infrastructure.
 * Une organisation porte des memberships (rôle par organisation) et un état
 * de suspension. Le rôle effectif d'un utilisateur est celui de sa membership.
 */

import type { Role } from "@/domain/entities/user";

export type Organization = {
  id: string;
  name: string;
  suspendedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MembershipRole = Role;

export type Membership = {
  organizationId: string;
  userId: string;
  role: MembershipRole;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Vrai si l'organisation est suspendue (aucun accès ni lien public). */
export function isOrganizationSuspended(organization: Pick<Organization, "suspendedAt">): boolean {
  return organization.suspendedAt !== null;
}

/** Nom par défaut d'une organisation : partie locale de l'email (ADR-0025 §7). */
export function defaultOrganizationName(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  return local === "" ? "Nouvelle organisation" : local;
}
