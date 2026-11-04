import { type Actor, assertSuperAdmin } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { LimitProfileRepository } from "@/application/ports/limit-profile-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";

export type AssignLimitProfileDependencies = {
  profiles: LimitProfileRepository;
  organizations: OrganizationRepository;
};

/** Assigne un profil de limites vivant à une organisation (super-admin). */
export async function assignLimitProfile(
  deps: AssignLimitProfileDependencies,
  actor: Actor,
  organizationId: string,
  raw: unknown,
): Promise<{ profileId: string }> {
  assertSuperAdmin(actor);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ValidationError("Requête invalide");
  }
  const profileId = (raw as { profileId?: unknown }).profileId;
  if (typeof profileId !== "string" || profileId.trim() === "") {
    throw new ValidationError("Profil de limites requis");
  }
  const organization = await deps.organizations.findById(organizationId);
  if (organization === null) throw new NotFoundError("Organisation introuvable");
  const profile = await deps.profiles.findById(profileId.trim());
  if (profile === null || !profile.active) {
    throw new NotFoundError("Profil de limites introuvable ou inactif");
  }
  const applied = await deps.profiles.applyToOrganization(organizationId, profile.id, actor.id);
  if (applied === null) throw new NotFoundError("Profil de limites introuvable");
  return { profileId: applied.id };
}
