import type { FileFieldConstraints } from "@/domain/entities/attachment";
import type { TemplateSimpleSettings } from "@/domain/template-settings";

/**
 * Schéma de définition d'une fiche de collecte (pure, sans framework).
 * Une définition décrit les champs à collecter (dont champs fichier), le
 * prompt effectif et le rendu du livrable. Elle est portée par les snapshots
 * `chatbot_configs.fiche_definitions` et `fiches.definition`.
 */

export const TEMPLATE_FIELD_TYPES = [
  "text",
  "textarea",
  "select",
  "multi",
  "url",
  "email",
  "file",
] as const;

export type TemplateFieldType = (typeof TEMPLATE_FIELD_TYPES)[number];

export function isTemplateFieldType(value: string): value is TemplateFieldType {
  return (TEMPLATE_FIELD_TYPES as readonly string[]).includes(value);
}

export type TemplateRequiredIf = {
  field: string;
  equals: string;
};

export type TemplateField = {
  name: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options?: string[];
  requiredIf?: TemplateRequiredIf;
  /** Exemple de réponse attendue (aide à la saisie et aperçu). */
  example?: string;
  /** Contraintes d'un champ `file` (ADR-0034). */
  file?: FileFieldConstraints;
};

export type TemplateDefinition = {
  key: string;
  label: string;
  description: string;
  systemPrompt: string;
  fields: TemplateField[];
  renderTemplate: string;
  /** Réglages du mode Simple (facultatif : anciens modèles sans ce bloc). */
  simple?: TemplateSimpleSettings;
  /** Origine du snapshot, si la définition vient d'une fiche de collecte. */
  sourceFicheId?: string;
  sourceVersion?: number;
};
