import { type Actor, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiGrantRepository } from "@/application/ports/ai-grant-repository";
import type {
  LimitProfile,
  LimitProfileRepository,
} from "@/application/ports/limit-profile-repository";
import { parseInvitationProvisioning } from "@/application/use-cases/invitations/invitation-provisioning";

export type LimitProfileDependencies = {
  profiles: LimitProfileRepository;
  grants: AiGrantRepository;
};

function sourceOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Requête invalide");
  }
  return value as Record<string, unknown>;
}

function parseName(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Nom du profil de limites requis");
  const name = value.trim();
  if (name.length < 1 || name.length > 120) {
    throw new ValidationError("Nom du profil de limites : 1 à 120 caractères");
  }
  return name;
}

function parseDescription(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new ValidationError("Description invalide");
  const description = value.trim();
  if (description.length > 2000) throw new ValidationError("Description trop longue (2000 max)");
  return description;
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string }).code === "23505";
}

async function parseProvisioning(deps: LimitProfileDependencies, value: unknown) {
  const catalog = await deps.grants.listCatalog();
  const provisioning = parseInvitationProvisioning(value, catalog);
  if (provisioning === null) throw new ValidationError("Provisioning du profil de limites requis");
  return provisioning;
}

/** Liste les profils de limites (super-admin). */
export async function listLimitProfiles(
  deps: Pick<LimitProfileDependencies, "profiles">,
  actor: Actor,
  includeInactive = false,
): Promise<LimitProfile[]> {
  assertSuperAdmin(actor);
  return deps.profiles.list(includeInactive);
}

/** Crée un profil de limites à partir d'un snapshot de provisioning (super-admin). */
export async function createLimitProfile(
  deps: LimitProfileDependencies,
  actor: Actor,
  input: unknown,
): Promise<LimitProfile> {
  assertSuperAdmin(actor);
  const source = sourceOf(input);
  const provisioning = await parseProvisioning(deps, source.provisioning);
  try {
    return await deps.profiles.create({
      name: parseName(source.name),
      description: parseDescription(source.description),
      provisioning,
      active: source.active !== false,
      createdBy: actor.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Un profil porte déjà ce nom");
    throw error;
  }
}

/** Modifie un profil de limites existante (super-admin). */
export async function updateLimitProfile(
  deps: LimitProfileDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<LimitProfile> {
  assertSuperAdmin(actor);
  const source = sourceOf(input);
  const existing = await deps.profiles.findById(id);
  if (existing === null) throw new NotFoundError("Profil de limites introuvable");
  const patch = {
    ...(source.name === undefined ? {} : { name: parseName(source.name) }),
    ...(source.description === undefined
      ? {}
      : { description: parseDescription(source.description) }),
    ...(source.active === undefined ? {} : { active: source.active === true }),
    ...(source.provisioning === undefined
      ? {}
      : { provisioning: await parseProvisioning(deps, source.provisioning) }),
  };
  try {
    const updated = await deps.profiles.update(id, patch);
    if (updated === null) throw new NotFoundError("Profil de limites introuvable");
    await deps.profiles.syncToOrganizations(updated, actor.id);
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Un profil porte déjà ce nom");
    throw error;
  }
}

/** Supprime un profil de limites ; les invitations déjà créées conservent leur snapshot. */
export async function deleteLimitProfile(
  deps: Pick<LimitProfileDependencies, "profiles">,
  actor: Actor,
  id: string,
): Promise<void> {
  assertSuperAdmin(actor);
  if (!(await deps.profiles.delete(id))) throw new NotFoundError("Profil de limites introuvable");
}
