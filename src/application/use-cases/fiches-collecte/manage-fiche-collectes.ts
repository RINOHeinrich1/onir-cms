import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type {
  FicheCollecteRepository,
  FicheCollecteVersion,
} from "@/application/ports/fiche-collecte-repository";
import { type FicheCollecte, validateFicheCollecte } from "@/domain/entities/fiche-collecte";

export type ManageFicheCollectesDependencies = {
  fiches: FicheCollecteRepository;
};

export async function listFicheCollectes(
  deps: ManageFicheCollectesDependencies,
  actor: Actor,
): Promise<FicheCollecte[]> {
  assertCan(actor, "fiches_collecte:list");
  return deps.fiches.list(organizationOf(actor));
}

export async function getFicheCollecte(
  deps: ManageFicheCollectesDependencies,
  actor: Actor,
  id: string,
): Promise<FicheCollecte> {
  assertCan(actor, "fiches_collecte:read");
  const fiche = await deps.fiches.findById(organizationOf(actor), id);
  if (fiche === null) throw new NotFoundError("Fiche de collecte introuvable");
  return fiche;
}

export async function listFicheCollecteVersions(
  deps: ManageFicheCollectesDependencies,
  actor: Actor,
  id: string,
): Promise<FicheCollecteVersion[]> {
  assertCan(actor, "fiches_collecte:read");
  const organizationId = organizationOf(actor);
  const fiche = await deps.fiches.findById(organizationId, id);
  if (fiche === null) throw new NotFoundError("Fiche de collecte introuvable");
  return deps.fiches.listVersions(organizationId, id);
}

export async function createFicheCollecte(
  deps: ManageFicheCollectesDependencies,
  actor: Actor,
  input: unknown,
): Promise<FicheCollecte> {
  assertCan(actor, "fiches_collecte:create");
  const organizationId = organizationOf(actor);
  const validated = validateFicheCollecte(input);
  if (!validated.ok) throw new ValidationError(validated.errors.join(" ; "));
  let key = validated.value.key;
  let suffix = 2;
  while ((await deps.fiches.findByKey(organizationId, key)) !== null) {
    key = `${validated.value.key}-${suffix}`;
    suffix += 1;
  }
  return deps.fiches.create(organizationId, { ...validated.value, key }, actor.id);
}

/** Modifie une fiche en créant une nouvelle version immuable. */
export async function updateFicheCollecte(
  deps: ManageFicheCollectesDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<FicheCollecte> {
  assertCan(actor, "fiches_collecte:update");
  const organizationId = organizationOf(actor);
  const current = await deps.fiches.findById(organizationId, id);
  if (current === null) throw new NotFoundError("Fiche de collecte introuvable");
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const validated = validateFicheCollecte({
    key: "key" in source ? source.key : current.key,
    label: "label" in source ? source.label : current.label,
    description: "description" in source ? source.description : current.description,
    intent: "intent" in source ? source.intent : current.intent,
    fields: "fields" in source ? source.fields : current.fields,
    renderTemplate: "renderTemplate" in source ? source.renderTemplate : current.renderTemplate,
    instructions: "instructions" in source ? source.instructions : current.instructions,
  });
  if (!validated.ok) throw new ValidationError(validated.errors.join(" ; "));
  const homonym = await deps.fiches.findByKey(organizationId, validated.value.key);
  if (homonym !== null && homonym.id !== id) {
    throw new ConflictError(`Clé déjà utilisée : ${validated.value.key}`);
  }
  const updated = await deps.fiches.updateVersion(organizationId, id, validated.value, actor.id);
  if (updated === null) throw new NotFoundError("Fiche de collecte introuvable");
  return updated;
}

export async function deleteFicheCollecte(
  deps: ManageFicheCollectesDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "fiches_collecte:delete");
  const deleted = await deps.fiches.delete(organizationOf(actor), id);
  if (!deleted) throw new NotFoundError("Fiche de collecte introuvable");
}
