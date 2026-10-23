/**
 * Invitation d'un utilisateur par lien.
 * L'organisation et le rôle sont décidés par l'admin ; l'invité saisit son
 * identité et son mot de passe à l'acceptation.
 */

import type { Role } from "@/domain/entities/user";

export const INVITATION_TTL_DAYS = 7;

export type InvitationStatus = "pending" | "accepted" | "revoked" | "expired";

export type Invitation = {
  id: string;
  organizationId: string | null;
  role: Role;
  invitedBy: string;
  expiresAt: string;
  acceptedAt: string | null;
  acceptedBy: string | null;
  acceptedEmail: string | null;
  acceptedName: string | null;
  revokedAt: string | null;
  createdAt: string;
};

/** Statut calculé (jamais stocké en base). */
export function invitationStatus(invitation: Invitation, now = Date.now()): InvitationStatus {
  if (invitation.acceptedAt !== null) return "accepted";
  if (invitation.revokedAt !== null) return "revoked";
  if (new Date(invitation.expiresAt).getTime() <= now) return "expired";
  return "pending";
}

/** Une organisation personnelle n'est créée que pour un futur admin. */
export function isInvitationScopeValid(organizationId: string | null, role: Role): boolean {
  if (organizationId !== null) return true;
  return role === "admin";
}

/** Fin d'expiration par défaut. */
export function invitationExpiry(now = Date.now()): Date {
  return new Date(now + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
