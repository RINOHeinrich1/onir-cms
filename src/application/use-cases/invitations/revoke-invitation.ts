import { type Actor, assertCan, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError } from "@/application/errors";
import type {
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";

export type RevokeInvitationDependencies = {
  invitations: InvitationRepository;
};

/** Révoque une invitation encore valide. */
export async function revokeInvitation(
  deps: RevokeInvitationDependencies,
  actor: Actor,
  invitationId: string,
): Promise<InvitationRecord> {
  assertCan(actor, "invitations:revoke");

  const invitation = await deps.invitations.findById(invitationId);
  if (invitation === null) throw new NotFoundError("Invitation introuvable");

  if (invitation.organizationId === null) {
    assertSuperAdmin(actor);
  } else if (!actor.isSuperAdmin && invitation.organizationId !== actor.organizationId) {
    throw new NotFoundError("Invitation introuvable");
  }

  const revoked = await deps.invitations.revoke(invitationId);
  if (!revoked) {
    throw new ConflictError("Cette invitation est déjà acceptée ou révoquée");
  }

  const updated = await deps.invitations.findById(invitationId);
  if (updated === null) throw new NotFoundError("Invitation introuvable");
  return updated;
}
