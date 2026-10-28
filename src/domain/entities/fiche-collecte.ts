import type { TemplateField } from "@/domain/entities/chat-template";
import { validateTemplateDefinition } from "@/domain/template-schema";

const FICHE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_LABEL = 160;
const MAX_TEXT = 4000;

/**
 * Fiche de collecte réutilisable, indépendante d'un chatbot (ADR-0049 §2/§6).
 * Le contenu est versionné : chaque édition crée une nouvelle version
 * immuable ; un chatbot qui importe une fiche en conserve un snapshot.
 */
export type FicheCollecte = {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  description: string;
  intent: string;
  fields: TemplateField[];
  renderTemplate: string;
  instructions: string;
  version: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FicheCollecteInput = {
  key: string;
  label: string;
  description: string;
  intent: string;
  fields: TemplateField[];
  renderTemplate: string;
  instructions: string;
};

export type FicheCollecteValidationError = string;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Valide et normalise une fiche réutilisable (réutilise le schéma de champs). */
export function validateFicheCollecte(
  input: unknown,
): { ok: true; value: FicheCollecteInput } | { ok: false; errors: string[] } {
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const errors: string[] = [];

  const key = text(source.key);
  if (!FICHE_KEY_PATTERN.test(key)) {
    errors.push("Clé invalide (minuscules, chiffres et tirets, ex. « hotel »)");
  }
  const label = text(source.label);
  if (label === "") {
    errors.push("Libellé obligatoire");
  } else if (label.length > MAX_LABEL) {
    errors.push(`Libellé trop long (${MAX_LABEL} caractères maximum)`);
  }
  const renderTemplate = text(source.renderTemplate);
  const validated = validateTemplateDefinition({
    key,
    label,
    description: text(source.description),
    systemPrompt: "validation",
    fields: source.fields,
    renderTemplate,
  });
  if (!validated.ok) errors.push(...validated.errors);
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      key,
      label,
      description: text(source.description).slice(0, MAX_TEXT),
      intent: text(source.intent).slice(0, MAX_TEXT),
      fields: validated.ok ? validated.value.fields : [],
      renderTemplate,
      instructions: text(source.instructions).slice(0, MAX_TEXT),
    },
  };
}

/** Copie une fiche réutilisable vers l'entrée de configuration d'un chatbot. */
export function ficheToDefinitionSnapshot(
  fiche: FicheCollecte,
): FicheCollecteInput & { sourceFicheId: string; sourceVersion: number } {
  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    intent: fiche.intent,
    fields: fiche.fields,
    renderTemplate: fiche.renderTemplate,
    instructions: fiche.instructions,
    sourceFicheId: fiche.id,
    sourceVersion: fiche.version,
  };
}
