import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import {
  type Fiche,
  type FicheArchiveFilter,
  MANUAL_FICHE_DEFINITION,
} from "@/domain/entities/fiche";
import { validateTemplateData } from "@/domain/validate-template-data";

export type ManageFichesDependencies = {
  fiches: FicheRepository;
};

export type ReadFichesDependencies = {
  fiches: FicheRepository;
};

/** US-FICHE-001 — création manuelle d'une fiche (admin/marketeur, modèle piloté). */
export async function createFiche(
  deps: ManageFichesDependencies,
  actor: Actor,
  input: unknown,
): Promise<Fiche> {
  assertCan(actor, "project:write");
  const organizationId = organizationOf(actor);

  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const rawData =
    source.data !== null && typeof source.data === "object" && !Array.isArray(source.data)
      ? (source.data as Record<string, unknown>)
      : source;
  const validated = validateTemplateData(MANUAL_FICHE_DEFINITION, rawData);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.join(" ; "));
  }
  const chatLinkIds = Array.isArray(source.chatLinkIds)
    ? [
        ...new Set(
          source.chatLinkIds.filter(
            (entry): entry is string => typeof entry === "string" && entry.trim() !== "",
          ),
        ),
      ]
    : [];

  return deps.fiches.create(organizationId, {
    conversationId: null,
    prospectId: typeof source.prospectId === "string" ? source.prospectId : null,
    createdBy: actor.id,
    templateKey: null,
    templateVersion: null,
    definition: MANUAL_FICHE_DEFINITION,
    chatLinkIds,
    data: validated.value,
  });
}

/** US-FICHE-001 — liste des fiches (lecture tous rôles). */
export async function listFiches(
  deps: ReadFichesDependencies,
  actor: Actor,
  filter: FicheArchiveFilter = "actives",
  linkLabel: string | string[] | null = null,
): Promise<Fiche[]> {
  assertCan(actor, "project:read");
  return deps.fiches.list(organizationOf(actor), filter, linkLabel);
}

/** US-FICHE-002 — archive / désarchive une fiche (admin/marketeur). */
export async function setFicheArchivee(
  deps: ReadFichesDependencies,
  actor: Actor,
  id: string,
  archivee: boolean,
): Promise<Fiche> {
  assertCan(actor, "project:write");
  const updated = await deps.fiches.setArchivee(organizationOf(actor), id, archivee);
  if (updated === null) {
    throw new NotFoundError("Fiche introuvable");
  }
  return updated;
}

/** US-FICHE-001 — lecture d'une fiche (lecture tous rôles). */
export async function getFiche(
  deps: ReadFichesDependencies,
  actor: Actor,
  id: string,
): Promise<Fiche> {
  assertCan(actor, "project:read");

  const fiche = await deps.fiches.findById(organizationOf(actor), id);
  if (fiche === null) {
    throw new NotFoundError("Fiche introuvable");
  }
  return fiche;
}
