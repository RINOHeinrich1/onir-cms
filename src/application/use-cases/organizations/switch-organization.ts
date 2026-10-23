import type { Actor } from "@/application/actor";
import {
  ForbiddenError,
  NotFoundError,
  OrganizationSuspendedError,
  ValidationError,
} from "@/application/errors";
import type { MembershipRepository } from "@/application/ports/membership-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { SessionRepository } from "@/application/ports/session-repository";
import type { UserRepository } from "@/application/ports/user-repository";
import type { Organization } from "@/domain/entities/organization";
import type { Role } from "@/domain/entities/user";

export type SwitchOrganizationDependencies = {
  organizations: OrganizationRepository;
  memberships: MembershipRepository;
  sessions: SessionRepository;
  users: UserRepository;
};

export type SwitchOrganizationResult = {
  organization: Organization;
  /** Rôle de la membership active (null pour un super-admin non membre). */
  role: Role | null;
};

/**
 * ADR-0025 §4/§5 — bascule d'organisation.
 * L'identifiant cible vient du body mais n'est **jamais** utilisé comme
 * organisation active sans vérification : membership (ou super-admin) et
 * organisation non suspendue sont exigées. La session serveur est mise à jour.
 */
export async function switchOrganization(
  deps: SwitchOrganizationDependencies,
  actor: Actor,
  sessionId: string,
  input: { organizationId: unknown },
): Promise<SwitchOrganizationResult> {
  const organizationId =
    typeof input.organizationId === "string" ? input.organizationId.trim() : "";
  if (organizationId === "") {
    throw new ValidationError("Organisation manquante");
  }

  const organization = await deps.organizations.findById(organizationId);
  if (organization === null) {
    throw new NotFoundError("Organisation introuvable");
  }
  if (organization.suspendedAt !== null) {
    throw new OrganizationSuspendedError("Organisation suspendue");
  }

  let role: Role | null = null;
  if (!actor.isSuperAdmin) {
    // L'utilisateur peut basculer vers toute organisation dont il est membre,
    // y compris depuis l'état « aucune organisation ».
    role = await deps.memberships.findRole(organizationId, actor.id);
    if (role === null) {
      throw new ForbiddenError("Vous n'êtes pas membre de cette organisation");
    }
  } else {
    role = await deps.memberships.findRole(organizationId, actor.id);
  }

  await deps.sessions.setActiveOrganization(sessionId, organizationId);
  await deps.users.updateLastOrganization(actor.id, organizationId);
  return { organization, role };
}
