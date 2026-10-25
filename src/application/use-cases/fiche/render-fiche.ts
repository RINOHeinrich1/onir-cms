import { type Actor, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { getFiche } from "@/application/use-cases/fiche/manage-fiches";
import type { FicheAttachment } from "@/domain/entities/attachment";
import type { Fiche } from "@/domain/entities/fiche";
import { renderTemplateMarkdown } from "@/domain/render-template";
import { buildServerVariables } from "@/domain/template-variables";

export type RenderFicheDependencies = {
  fiches: FicheRepository;
  templates: ChatTemplateRepository;
  prospects: ProspectRepository;
  attachments: AttachmentRepository;
};

export type RenderedFiche = {
  fiche: Fiche;
  /** Pièces jointes rattachées à la fiche (ADR-0034). */
  attachments: FicheAttachment[];
  /** Document Markdown du rapport, prêt à afficher ou télécharger. */
  markdown: string;
};

/**
 * US-FICHE-001 — rendu Markdown d'une fiche (document livrable) à partir de son
 * snapshot de modèle et de ses données. Un seul chemin de rendu, partagé par la
 * page de lecture et le téléchargement (PDF/Markdown).
 */
export async function renderFiche(
  deps: RenderFicheDependencies,
  actor: Actor,
  id: string,
): Promise<RenderedFiche> {
  const organizationId = organizationOf(actor);
  const fiche = await getFiche({ fiches: deps.fiches }, actor, id);

  const template = await deps.templates.findVersion(
    organizationId,
    fiche.templateKey,
    fiche.templateVersion,
  );
  if (template === null) {
    throw new NotFoundError("Modèle de raisonnement introuvable");
  }

  const prospect =
    fiche.prospectId === null
      ? null
      : await deps.prospects.findById(organizationId, fiche.prospectId);

  const attachments = await deps.attachments.listByFiche(organizationId, fiche.id);
  const fileValues: Record<string, string[]> = {};
  for (const attachment of attachments) {
    const names = fileValues[attachment.fieldName] ?? [];
    names.push(attachment.originalName);
    fileValues[attachment.fieldName] = names;
  }

  const markdown = renderTemplateMarkdown({
    definition: template.definition,
    data: fiche.data,
    serverVars: buildServerVariables({ mode: "standard", prospect, conversation: null }),
    date: fiche.createdAt.slice(0, 10),
    fileValues,
  });

  return { fiche, attachments, markdown };
}
