import { type Actor, assertCan, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiGrantRepository } from "@/application/ports/ai-grant-repository";
import type {
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";
import type { LimitProfileRepository } from "@/application/ports/limit-profile-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { parseInvitationProvisioning } from "@/application/use-cases/invitations/invitation-provisioning";
import { invitationExpiry, isInvitationScopeValid } from "@/domain/entities/invitation";
import { isRole, type Role } from "@/domain/entities/user";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { encryptLinkToken } from "@/lib/link-crypto";

export type CreateInvitationCommand = {
  organizationId?: unknown;
  role?: unknown;
  provisioning?: unknown;
  limitProfileId?: unknown;
};

export type CreateInvitationDependencies = {
  invitations: InvitationRepository;
  organizations: OrganizationRepository;
  grants?: AiGrantRepository;
  profiles?: LimitProfileRepository;
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

  if (organizationId !== null && input.provisioning !== undefined && input.provisioning !== null) {
    throw new ValidationError("Le provisioning IA est réservé à une invitation sans organisation");
  }
  const rawOfferId = typeof input.limitProfileId === "string" ? input.limitProfileId.trim() : "";
  const limitProfileId = rawOfferId === "" ? null : rawOfferId;
  if (organizationId !== null && limitProfileId !== null) {
    throw new ValidationError(
      "Un profil de limites est réservé à une invitation sans organisation",
    );
  }
  if (limitProfileId !== null && input.provisioning !== undefined && input.provisioning !== null) {
    throw new ValidationError(
      "Choisissez un profil de limites ou un provisioning personnalisé, pas les deux",
    );
  }

  let provisioning: Awaited<ReturnType<typeof parseInvitationProvisioning>> = null;
  if (organizationId === null && limitProfileId !== null) {
    if (deps.profiles === undefined) throw new ValidationError("Profils de limites indisponibles");
    const profile = await deps.profiles.findById(limitProfileId);
    if (profile === null || !profile.active) {
      throw new NotFoundError("Profil de limites introuvable ou inactif");
    }
    provisioning = null;
  } else if (organizationId === null) {
    provisioning = parseInvitationProvisioning(
      input.provisioning,
      deps.grants === undefined ? undefined : await deps.grants.listCatalog(),
    );
  }

  const token = createInvitationToken();
  const invitation = await deps.invitations.create({
    tokenHash: hashInvitationToken(token),
    tokenEnc: encryptLinkToken(token),
    organizationId,
    role,
    invitedBy: actor.id,
    expiresAt: invitationExpiry(),
    provisioning,
    limitProfileId,
  });

  return { invitation, token };
}
