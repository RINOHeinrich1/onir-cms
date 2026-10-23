import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { ConfidentialiteRepository } from "@/application/ports/confidentialite-repository";
import { type Confidentialite, validateConfidentialite } from "@/domain/entities/confidentialite";

export type ManageConfidentialitesDependencies = {
  confidentialites: ConfidentialiteRepository;
};

/** US-CONFID-001 — liste des politiques de confidentialité (lecture tous rôles). */
export async function listConfidentialites(
  deps: ManageConfidentialitesDependencies,
  actor: Actor,
): Promise<Confidentialite[]> {
  assertCan(actor, "confidentialites:list");
  return deps.confidentialites.list(organizationOf(actor));
}

/** US-CONFID-001 — création d'une politique (titre unique). */
export async function createConfidentialite(
  deps: ManageConfidentialitesDependencies,
  actor: Actor,
  input: unknown,
): Promise<Confidentialite> {
  assertCan(actor, "confidentialites:create");
  const organizationId = organizationOf(actor);
  const validated = validateConfidentialite(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.map((error) => error.message).join(" ; "));
  }
  const existing = await deps.confidentialites.findByTitre(organizationId, validated.value.titre);
  if (existing !== null) {
    throw new ConflictError(`Titre déjà utilisé : ${validated.value.titre}`);
  }
  return deps.confidentialites.create(organizationId, {
    ...validated.value,
    createdBy: actor.id,
  });
}

/** US-CONFID-001 — modification (titre, texte, lien, actif). */
export async function updateConfidentialite(
  deps: ManageConfidentialitesDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<Confidentialite> {
  assertCan(actor, "confidentialites:update");
  const organizationId = organizationOf(actor);
  const current = await deps.confidentialites.findById(organizationId, id);
  if (current === null) {
    throw new NotFoundError("Politique de confidentialité introuvable");
  }
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const validated = validateConfidentialite({
    titre: "titre" in source ? source.titre : current.titre,
    texte: "texte" in source ? source.texte : current.texte,
    lien: "lien" in source ? source.lien : current.lien,
    actif: "actif" in source ? source.actif : current.actif,
  });
  if (!validated.ok) {
    throw new ValidationError(validated.errors.map((error) => error.message).join(" ; "));
  }
  const homonym = await deps.confidentialites.findByTitre(organizationId, validated.value.titre);
  if (homonym !== null && homonym.id !== id) {
    throw new ConflictError(`Titre déjà utilisé : ${validated.value.titre}`);
  }
  const updated = await deps.confidentialites.update(organizationId, id, validated.value);
  if (updated === null) {
    throw new NotFoundError("Politique de confidentialité introuvable");
  }
  return updated;
}

/** US-CONFID-001 — suppression (les liens rattachés repassent à null). */
export async function deleteConfidentialite(
  deps: ManageConfidentialitesDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "confidentialites:delete");
  const deleted = await deps.confidentialites.delete(organizationOf(actor), id);
  if (!deleted) {
    throw new NotFoundError("Politique de confidentialité introuvable");
  }
}
