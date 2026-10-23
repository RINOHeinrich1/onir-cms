import { type Actor, assertCan, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type {
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { invitationExpiry, isInvitationScopeValid } from "@/domain/entities/invitation";
import { isRole, type Role } from "@/domain/entities/user";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { encryptLinkToken } from "@/lib/link-crypto";

export type CreateInvitationCommand = {
  organizationId?: unknown;
  role?: unknown;
};

export type CreateInvitationDependencies = {
  invitations: InvitationRepository;
  organizations: OrganizationRepository;
};

function parseInvitationRole(value: unknown): Role {
  if (value === undefined || value === null || value === "") return "lecteur";
  if (typeof value !== "string" || !isRole(value)) {
    throw new ValidationError("Rôle invalide");
  }
  return value;
}

/**
 * Crée un lien d'invitation à usage unique.
 * - admin d'organisation : uniquement sa propre organisation, organisation obligatoire ;
 * - super-admin : toutes les organisations, ou aucune (→ organisation personnelle admin).
 */
export async function createInvitation(
  deps: CreateInvitationDependencies,
  actor: Actor,
  input: CreateInvitationCommand,
): Promise<{ invitation: InvitationRecord; token: string }> {
  assertCan(actor, "invitations:create");

  const role = parseInvitationRole(input.role);
  const rawOrganization =
    typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  const organizationId = rawOrganization === "" ? null : rawOrganization;

  if (organizationId === null) {
    assertSuperAdmin(actor);
  } else if (!actor.isSuperAdmin && organizationId !== actor.organizationId) {
    throw new NotFoundError("Organisation introuvable");
  }

  if (!isInvitationScopeValid(organizationId, role)) {
    throw new ValidationError(
      "Une organisation est obligatoire pour ce rôle (seul un admin peut être invité sans organisation)",
    );
  }

  if (organizationId !== null) {
    const organization = await deps.organizations.findById(organizationId);
    if (organization === null) throw new NotFoundError("Organisation introuvable");
    if (organization.suspendedAt !== null) {
      throw new ConflictError("Cette organisation est suspendue");
    }
  }

  const token = createInvitationToken();
  const invitation = await deps.invitations.create({
    tokenHash: hashInvitationToken(token),
    tokenEnc: encryptLinkToken(token),
    organizationId,
    role,
    invitedBy: actor.id,
    expiresAt: invitationExpiry(),
  });

  return { invitation, token };
}
