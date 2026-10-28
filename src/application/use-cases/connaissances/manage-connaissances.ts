import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import { hasChatLinkIds, normalizeChatLinkIds } from "@/domain/entities/chat-link-scope";
import type { Connaissance } from "@/domain/entities/connaissance";
import { validateConnaissance } from "@/domain/entities/connaissance";

export type ManageConnaissancesDependencies = {
  connaissances: ConnaissanceRepository;
};

/** US-CONNAISS-001 — liste (lecture). */
export async function listConnaissances(
  deps: ManageConnaissancesDependencies,
  actor: Actor,
): Promise<Connaissance[]> {
  assertCan(actor, "connaissances:list");
  return deps.connaissances.list(organizationOf(actor));
}

/** US-CONNAISS-001 — création (admin/marketeur), titre unique. */
export async function createConnaissance(
  deps: ManageConnaissancesDependencies,
  actor: Actor,
  input: unknown,
): Promise<Connaissance> {
  assertCan(actor, "connaissances:create");
  const organizationId = organizationOf(actor);

  const validated = validateConnaissance(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.map((error) => error.message).join(" ; "));
  }
  const existing = await deps.connaissances.findByTitre(organizationId, validated.value.titre);
  if (existing !== null) {
    throw new ConflictError(`Titre déjà utilisé : ${validated.value.titre}`);
  }

  return deps.connaissances.create(organizationId, {
    ...validated.value,
    createdBy: actor.id,
  });
}

/** US-CONNAISS-001 — modification partielle (admin/marketeur). */
export async function updateConnaissance(
  deps: ManageConnaissancesDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<Connaissance> {
  assertCan(actor, "connaissances:update");
  const organizationId = organizationOf(actor);

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const patch: {
    titre?: string;
    contenu?: string;
    chatLinkIds?: string[];
    actif?: boolean;
  } = {};

  if ("titre" in source) {
    const titre = typeof source.titre === "string" ? source.titre.trim() : "";
    if (titre === "") throw new ValidationError("Le titre est obligatoire");
    if (titre.length > 120) throw new ValidationError("Titre trop long (120 caractères maximum)");
    const homonym = await deps.connaissances.findByTitre(organizationId, titre);
    if (homonym !== null && homonym.id !== id) {
      throw new ConflictError(`Titre déjà utilisé : ${titre}`);
    }
    patch.titre = titre;
  }
  if ("contenu" in source) {
    const contenu = typeof source.contenu === "string" ? source.contenu.trim() : "";
    if (contenu === "") throw new ValidationError("Le contenu est obligatoire");
    patch.contenu = contenu;
  }
  if (hasChatLinkIds(source)) {
    const scope = normalizeChatLinkIds(source.chatLinkIds);
    if (!scope.ok) throw new ValidationError(scope.message);
    patch.chatLinkIds = scope.ids;
  }
  if ("actif" in source) {
    patch.actif = source.actif === true;
  }

  const updated = await deps.connaissances.update(organizationId, id, patch);
  if (updated === null) {
    throw new NotFoundError("Entrée introuvable");
  }
  return updated;
}

/** US-CONNAISS-001 — suppression (admin/marketeur). */
export async function deleteConnaissance(
  deps: ManageConnaissancesDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "connaissances:delete");

  const deleted = await deps.connaissances.delete(organizationOf(actor), id);
  if (!deleted) {
    throw new NotFoundError("Entrée introuvable");
  }
}
