import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { Fiche, FicheArchiveFilter } from "@/domain/entities/fiche";
import { validateTemplateData } from "@/domain/validate-template-data";

export type ManageFichesDependencies = {
  fiches: FicheRepository;
  templates: ChatTemplateRepository;
};

export type ReadFichesDependencies = {
  fiches: FicheRepository;
};

async function resolveDefinition(
  templates: ChatTemplateRepository,
  organizationId: string,
  templateKey: unknown,
  templateVersion: unknown,
) {
  const key =
    typeof templateKey === "string" && templateKey.trim() !== "" ? templateKey : "fiche-projet";
  if (
    typeof templateVersion === "number" &&
    Number.isInteger(templateVersion) &&
    templateVersion >= 1
  ) {
    const exact = await templates.findVersion(organizationId, key, templateVersion);
    if (exact !== null) return exact.definition;
  }
  const current = await templates.currentVersion(organizationId, key);
  if (current === null) {
    throw new ValidationError(`Modèle inconnu : ${key}`);
  }
  return current.definition;
}

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
  const definition = await resolveDefinition(
    deps.templates,
    organizationId,
    source.templateKey,
    source.templateVersion,
  );

  const validated = validateTemplateData(definition, source.data ?? source);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.join(" ; "));
  }

  const current = await deps.templates.currentVersion(organizationId, definition.key);
  return deps.fiches.create(organizationId, {
    conversationId: null,
    prospectId: typeof source.prospectId === "string" ? source.prospectId : null,
    createdBy: actor.id,
    templateKey: definition.key,
    templateVersion: current?.version ?? 1,
    data: validated.value,
  });
}

/** US-FICHE-001 — liste des fiches (lecture tous rôles). */
export async function listFiches(
  deps: ReadFichesDependencies,
  actor: Actor,
  filter: FicheArchiveFilter = "actives",
  linkLabel: string | null = null,
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
