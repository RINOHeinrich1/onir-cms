import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { FicheCollecteRepository } from "@/application/ports/fiche-collecte-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import { defaultStatusKeyFor } from "@/application/use-cases/fiche/manage-fiche-status";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  type Fiche,
  type FicheArchiveFilter,
  MANUAL_FICHE_DEFINITION,
  MANUAL_FICHE_KEY,
} from "@/domain/entities/fiche";
import { ficheToDefinitionSnapshot } from "@/domain/entities/fiche-collecte";
import { validateTemplateData } from "@/domain/validate-template-data";

export type ManageFichesDependencies = {
  fiches: FicheRepository;
  ficheCollectes?: FicheCollecteRepository;
};

export type ReadFichesDependencies = {
  fiches: FicheRepository;
};

/** US-FICHE-001 — création manuelle d'une fiche (admin/marketeur). */
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
  const definition = await resolveFicheDefinition(deps, organizationId, source);
  const rawData =
    source.data !== null && typeof source.data === "object" && !Array.isArray(source.data)
      ? (source.data as Record<string, unknown>)
      : source;
  const validated = validateTemplateData(definition, rawData);
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
    definition,
    ficheKey: definition.key === MANUAL_FICHE_KEY ? MANUAL_FICHE_KEY : definition.key,
    chatLinkIds,
    data: validated.value,
    qualificationStatusKey: defaultStatusKeyFor(definition),
  });
}

async function resolveFicheDefinition(
  deps: ManageFichesDependencies,
  organizationId: string,
  source: Record<string, unknown>,
): Promise<TemplateDefinition> {
  const ficheCollecteId =
    typeof source.ficheCollecteId === "string" ? source.ficheCollecteId.trim() : "";
  if (ficheCollecteId === "") return MANUAL_FICHE_DEFINITION;
  if (deps.ficheCollectes === undefined) {
    throw new ValidationError("Bibliothèque de fiches de collecte indisponible");
  }
  const fiche = await deps.ficheCollectes.findById(organizationId, ficheCollecteId);
  if (fiche === null) throw new NotFoundError("Fiche de collecte introuvable");
  const snapshot = ficheToDefinitionSnapshot(fiche);
  return {
    key: snapshot.key,
    label: snapshot.label,
    description: snapshot.description,
    systemPrompt: "",
    fields: snapshot.fields,
    statuses: snapshot.statuses,
    renderTemplate: snapshot.renderTemplate,
  };
}

/** US-FICHE-001 — liste des fiches (lecture tous rôles). */
export async function listFiches(
  deps: ReadFichesDependencies,
  actor: Actor,
  filter: FicheArchiveFilter = "actives",
  linkLabel: string | string[] | null = null,
  statusKeys: string[] | null = null,
): Promise<Fiche[]> {
  assertCan(actor, "project:read");
  return deps.fiches.list(organizationOf(actor), filter, linkLabel, statusKeys);
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
