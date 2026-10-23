import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type {
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";

export type ListInvitationsDependencies = {
  invitations: InvitationRepository;
};

/** Liste les invitations visibles par l'acteur (super-admin : toutes). */
export async function listInvitations(
  deps: ListInvitationsDependencies,
  actor: Actor,
): Promise<InvitationRecord[]> {
  assertCan(actor, "invitations:list");
  if (actor.isSuperAdmin) return deps.invitations.listAll();
  return deps.invitations.listForOrganization(organizationOf(actor));
}
