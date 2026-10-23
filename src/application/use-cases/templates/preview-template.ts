import { type Actor, assertCan } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import {
  buildSampleData,
  buildTemplatePreview,
  PREVIEW_SERVER_VARS,
} from "@/domain/template-preview";
import { validateTemplateDefinition } from "@/domain/template-schema";

export type TemplateDeps = {
  templates: ChatTemplateRepository;
};

export type TemplatePreview = {
  systemPrompt: string;
  markdown: string;
};

const SAMPLE_DATA: Record<string, unknown> = {
  plateformes: ["site web", "SaaS"],
  description: "Exemple : site vitrine pour un commerce de quartier.",
  budget: "Exemple : 5 000 €",
  duree: "Exemple : 2 mois",
  contact: "Exemple : jean@exemple.mg",
  statut: "initier",
  contraintesTechno: "",
  lienDocSpec: "",
  profil: "particulier",
  ticket: "Exemple : 50 000 €",
  secteurs: ["tech"],
  horizon: "",
  sujet: "Exemple : refonte du site",
  questions: "Exemple : quels délais ?",
};

/**
 * Prévisualisation d'une définition (brouillon non persisté) avec des
 * données fictives : prompt système + markdown rendus.
 */
export async function previewTemplate(
  deps: TemplateDeps,
  actor: Actor,
  input: unknown,
): Promise<TemplatePreview> {
  assertCan(actor, "templates:read");
  void deps;

  const validated = validateTemplateDefinition(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.join(" ; "));
  }
  const definition = validated.value;

  const sample = buildSampleData(definition.fields);
  for (const field of definition.fields) {
    if (field.example !== undefined && field.example.trim() !== "") continue;
    const fallback = SAMPLE_DATA[field.name];
    if (fallback !== undefined) sample[field.name] = fallback;
  }

  return buildTemplatePreview({
    definition,
    sampleData: sample,
    serverVars: PREVIEW_SERVER_VARS,
    date: PREVIEW_SERVER_VARS.date ?? "2026-01-01",
  });
}
