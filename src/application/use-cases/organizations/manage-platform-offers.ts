import { type Actor, assertSuperAdmin } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { AiGrantRepository } from "@/application/ports/ai-grant-repository";
import type {
  PlatformOffer,
  PlatformOfferRepository,
} from "@/application/ports/platform-offer-repository";
import { parseInvitationProvisioning } from "@/application/use-cases/invitations/invitation-provisioning";

export type PlatformOfferDependencies = {
  offers: PlatformOfferRepository;
  grants: AiGrantRepository;
};

function sourceOf(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Requête invalide");
  }
  return value as Record<string, unknown>;
}

function parseName(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Nom de l'offre requis");
  const name = value.trim();
  if (name.length < 1 || name.length > 120) {
    throw new ValidationError("Nom de l'offre : 1 à 120 caractères");
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

async function parseProvisioning(deps: PlatformOfferDependencies, value: unknown) {
  const catalog = await deps.grants.listCatalog();
  const provisioning = parseInvitationProvisioning(value, catalog);
  if (provisioning === null) throw new ValidationError("Provisioning de l'offre requis");
  return provisioning;
}

/** Liste les offres (super-admin). */
export async function listPlatformOffers(
  deps: Pick<PlatformOfferDependencies, "offers">,
  actor: Actor,
  includeInactive = false,
): Promise<PlatformOffer[]> {
  assertSuperAdmin(actor);
  return deps.offers.list(includeInactive);
}

/** Crée une offre à partir d'un snapshot de provisioning (super-admin). */
export async function createPlatformOffer(
  deps: PlatformOfferDependencies,
  actor: Actor,
  input: unknown,
): Promise<PlatformOffer> {
  assertSuperAdmin(actor);
  const source = sourceOf(input);
  const provisioning = await parseProvisioning(deps, source.provisioning);
  try {
    return await deps.offers.create({
      name: parseName(source.name),
      description: parseDescription(source.description),
      provisioning,
      active: source.active !== false,
      createdBy: actor.id,
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Une offre porte déjà ce nom");
    throw error;
  }
}

/** Modifie une offre existante (super-admin). */
export async function updatePlatformOffer(
  deps: PlatformOfferDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<PlatformOffer> {
  assertSuperAdmin(actor);
  const source = sourceOf(input);
  const existing = await deps.offers.findById(id);
  if (existing === null) throw new NotFoundError("Offre introuvable");
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
    const updated = await deps.offers.update(id, patch);
    if (updated === null) throw new NotFoundError("Offre introuvable");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw new ConflictError("Une offre porte déjà ce nom");
    throw error;
  }
}

/** Supprime une offre ; les invitations déjà créées conservent leur snapshot. */
export async function deletePlatformOffer(
  deps: Pick<PlatformOfferDependencies, "offers">,
  actor: Actor,
  id: string,
): Promise<void> {
  assertSuperAdmin(actor);
  if (!(await deps.offers.delete(id))) throw new NotFoundError("Offre introuvable");
}
