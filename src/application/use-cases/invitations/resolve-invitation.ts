import type { InvitationRepository } from "@/application/ports/invitation-repository";
import { type InvitationStatus, invitationStatus } from "@/domain/entities/invitation";
import type { Role } from "@/domain/entities/user";
import { hashInvitationToken } from "@/lib/invitation-token";

export type ResolvedInvitation = {
  status: InvitationStatus;
  organizationId: string | null;
  organizationName: string | null;
  role: Role;
  expiresAt: string;
};

export type ResolveInvitationDependencies = {
  invitations: InvitationRepository;
};

/** Résout un jeton public sans révéler l'invitant ni le jeton lui-même. */
export async function resolveInvitation(
  deps: ResolveInvitationDependencies,
  token: string,
): Promise<ResolvedInvitation | null> {
  if (token.trim() === "" || token.length > 256) return null;
  const invitation = await deps.invitations.findByTokenHash(hashInvitationToken(token));
  if (invitation === null) return null;
  return {
    status: invitationStatus(invitation),
    organizationId: invitation.organizationId,
    organizationName: invitation.organizationName,
    role: invitation.organizationId === null ? "admin" : invitation.role,
    expiresAt: invitation.expiresAt,
  };
}
