/**
 * Aperçu pur d'un modèle (brouillon) : prompt final + fiche Markdown.
 * Utilisé par l'API d'aperçu et par l'aperçu live du formulaire.
 */

import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import { renderTemplate } from "@/domain/render-template";
import { buildRenderVariables } from "@/domain/template-variables";

export type TemplatePreview = {
  systemPrompt: string;
  markdown: string;
};

/** Contexte fictif stable pour les aperçus. */
export const PREVIEW_SERVER_VARS: Record<string, string> = {
  date: "2026-01-01",
  visitor_nom: "Visiteur Exemple",
  visitor_email: "visiteur@exemple.mg",
  visitor_identifie: "1",
  prospect_nom: "",
  prospect_prenom: "",
  prospect_nature: "",
  prospect_nature_label: "",
  prospect_email: "",
  prospect_activite: "",
  prospect_fonction: "",
  prospect_contexte: "",
  prospect_connu: "",
  visiteur_connu: "1",
  prospect_present: "",
};

/** Valeurs d'exemple dérivées des champs (et de `example` si fourni). */
export function buildSampleData(fields: readonly TemplateField[]): Record<string, unknown> {
  const sample: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.example !== undefined && field.example.trim() !== "") {
      sample[field.name] = field.type === "multi" ? [field.example.trim()] : field.example.trim();
      continue;
    }
    if (field.type === "multi") {
      sample[field.name] = [field.options?.[0] ?? "Exemple"];
      continue;
    }
    if (field.type === "select") {
      sample[field.name] = field.options?.[0] ?? "Exemple";
      continue;
    }
    if (field.type === "url") {
      sample[field.name] = "https://exemple.com";
      continue;
    }
    if (field.type === "email") {
      sample[field.name] = "visiteur@exemple.mg";
      continue;
    }
    sample[field.name] = field.type === "textarea" ? "Exemple de réponse" : "Exemple";
  }
  return sample;
}

/** Rend le prompt et la fiche à partir d'une définition et de données d'exemple. */
export function buildTemplatePreview(input: {
  definition: TemplateDefinition;
  sampleData: Record<string, unknown>;
  serverVars?: Record<string, string>;
  date?: string;
}): TemplatePreview {
  const serverVars = input.serverVars ?? PREVIEW_SERVER_VARS;
  const date = input.date ?? serverVars.date ?? "2026-01-01";
  const fileValues = Object.fromEntries(
    input.definition.fields
      .filter((field) => field.type === "file")
      .map((field) => [field.name, [`${field.name}-exemple.pdf`]]),
  );
  const renderVars = buildRenderVariables(
    input.definition,
    input.sampleData,
    serverVars,
    { date },
    fileValues,
  );
  const promptVars = buildRenderVariables(input.definition, {}, serverVars, { date });

  return {
    systemPrompt: renderTemplate(input.definition.systemPrompt, promptVars),
    markdown: `${renderTemplate(input.definition.renderTemplate, renderVars).trim()}\n`,
  };
}
