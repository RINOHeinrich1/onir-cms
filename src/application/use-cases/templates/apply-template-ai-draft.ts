/** Application d'un brouillon IA : version du modèle + connaissances (ADR-0038). */

import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError, ValidationError } from "@/application/errors";
import type {
  ApplyTemplateAiResult,
  KnowledgeMergePolicy,
  TemplateAiRepository,
} from "@/application/ports/template-ai-repository";
import {
  TEMPLATE_AI_MAX_KNOWLEDGE,
  TEMPLATE_AI_MAX_KNOWLEDGE_CONTENT,
  TEMPLATE_AI_MAX_KNOWLEDGE_TITLE,
} from "@/domain/template-ai-draft";
import { validateTemplateDefinition } from "@/domain/template-schema";

export type ApplyTemplateAiDraftInput = {
  templateKey?: string;
  definition: unknown;
  knowledge: unknown;
  mergePolicy: unknown;
  generationId: unknown;
};

export type ApplyTemplateAiDraftDependencies = {
  templatesAi: TemplateAiRepository;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeKnowledge(value: unknown): Array<{ titre: string; contenu: string }> {
  if (!Array.isArray(value)) throw new ValidationError("Liste de connaissances invalide");
  if (value.length > TEMPLATE_AI_MAX_KNOWLEDGE) {
    throw new ValidationError(`Trop de connaissances (${TEMPLATE_AI_MAX_KNOWLEDGE} maximum)`);
  }
  const result: Array<{ titre: string; contenu: string }> = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new ValidationError("Connaissance invalide");
    }
    const row = entry as Record<string, unknown>;
    const titre = text(row.titre);
    const contenu = text(row.contenu);
    if (titre === "" || contenu === "") {
      throw new ValidationError("Chaque connaissance doit avoir un titre et un contenu");
    }
    if (titre.length > TEMPLATE_AI_MAX_KNOWLEDGE_TITLE) {
      throw new ValidationError(`Titre de connaissance trop long (${titre.length} caractères)`);
    }
    if (contenu.length > TEMPLATE_AI_MAX_KNOWLEDGE_CONTENT) {
      throw new ValidationError(
        `Contenu de connaissance trop long (${TEMPLATE_AI_MAX_KNOWLEDGE_CONTENT} caractères maximum)`,
      );
    }
    const fingerprint = titre.toLocaleLowerCase("fr");
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    result.push({ titre, contenu });
  }
  return result;
}

export async function applyTemplateAiDraft(
  deps: ApplyTemplateAiDraftDependencies,
  actor: Actor,
  input: ApplyTemplateAiDraftInput,
): Promise<ApplyTemplateAiResult> {
  const templateKey = text(input.templateKey) === "" ? null : text(input.templateKey);
  assertCan(actor, templateKey === null ? "templates:create" : "templates:update");
  const organizationId = organizationOf(actor);

  const validated = validateTemplateDefinition(input.definition);
  if (!validated.ok) throw new ValidationError(validated.errors.join(" ; "));
  if (templateKey !== null && validated.value.key !== templateKey) {
    throw new ValidationError("La clé d'un modèle ne peut pas changer");
  }

  const mergePolicy = text(input.mergePolicy) === "replace" ? "replace" : "append";
  const generationId = text(input.generationId);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(generationId)
  ) {
    throw new ValidationError("Identifiant de génération invalide");
  }
  const knowledge = normalizeKnowledge(input.knowledge);

  try {
    return await deps.templatesAi.apply({
      organizationId,
      templateKey,
      definition: validated.value,
      knowledge,
      mergePolicy: mergePolicy as KnowledgeMergePolicy,
      generationId,
      createdBy: actor.id,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ConflictError) throw error;
    if (error instanceof ValidationError) throw error;
    if ((error as { code?: string }).code === "23505") {
      throw new ConflictError("La clé du modèle ou un titre de connaissance est déjà utilisé");
    }
    throw error;
  }
}
