import { type Actor, assertCan, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiGrantRepository } from "@/application/ports/ai-grant-repository";
import type {
  InvitationRecord,
  InvitationRepository,
} from "@/application/ports/invitation-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { PlatformOfferRepository } from "@/application/ports/platform-offer-repository";
import { parseInvitationProvisioning } from "@/application/use-cases/invitations/invitation-provisioning";
import { invitationExpiry, isInvitationScopeValid } from "@/domain/entities/invitation";
import { isRole, type Role } from "@/domain/entities/user";
import { createInvitationToken, hashInvitationToken } from "@/lib/invitation-token";
import { encryptLinkToken } from "@/lib/link-crypto";

export type CreateInvitationCommand = {
  organizationId?: unknown;
  role?: unknown;
  provisioning?: unknown;
  offerId?: unknown;
};

export type CreateInvitationDependencies = {
  invitations: InvitationRepository;
  organizations: OrganizationRepository;
  grants?: AiGrantRepository;
  offers?: PlatformOfferRepository;
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
  const rawOfferId = typeof input.offerId === "string" ? input.offerId.trim() : "";
  const offerId = rawOfferId === "" ? null : rawOfferId;
  if (organizationId !== null && offerId !== null) {
    throw new ValidationError("Une offre est réservée à une invitation sans organisation");
  }
  if (offerId !== null && input.provisioning !== undefined && input.provisioning !== null) {
    throw new ValidationError("Choisissez une offre ou un provisioning personnalisé, pas les deux");
  }

  let provisioning: Awaited<ReturnType<typeof parseInvitationProvisioning>> = null;
  if (organizationId === null && offerId !== null) {
    if (deps.offers === undefined) throw new ValidationError("Offres indisponibles");
    const offer = await deps.offers.findById(offerId);
    if (offer === null || !offer.active) throw new NotFoundError("Offre introuvable ou inactive");
    provisioning = offer.provisioning;
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
    offerId,
  });

  return { invitation, token };
}
