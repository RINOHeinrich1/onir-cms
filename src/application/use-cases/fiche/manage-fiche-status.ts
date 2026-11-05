import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { Fiche } from "@/domain/entities/fiche";
import { defaultFicheStatusKey, findFicheStatus } from "@/domain/entities/fiche-status";

export type ManageFicheStatusDependencies = {
  fiches: FicheRepository;
};

/** Statut par défaut d'une définition, ou null si aucun statut. */
export function defaultStatusKeyFor(
  definition: TemplateDefinition | null | undefined,
): string | null {
  return defaultFicheStatusKey(definition?.statuses);
}

/** Change le statut de qualification d'une fiche (backoffice). */
export async function setFicheQualificationStatus(
  deps: ManageFicheStatusDependencies,
  actor: Actor,
  id: string,
  statusKey: string | null,
): Promise<Fiche> {
  assertCan(actor, "project:write");
  const organizationId = organizationOf(actor);
  const fiche = await deps.fiches.findById(organizationId, id);
  if (fiche === null) throw new NotFoundError("Fiche introuvable");

  if (statusKey !== null) {
    const status = findFicheStatus(fiche.definition?.statuses, statusKey);
    if (status === null) {
      throw new ValidationError("Statut de qualification inconnu");
    }
    if (status.archivedAt !== null) {
      throw new ValidationError("Statut de qualification archivé");
    }
  }

  const updated = await deps.fiches.setQualificationStatus(organizationId, id, statusKey, actor.id);
  if (updated === null) throw new NotFoundError("Fiche introuvable");
  return updated;
}
