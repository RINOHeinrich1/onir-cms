import type { FileFieldConstraints } from "@/domain/entities/attachment";

/**
 * Entités métier des modèles de raisonnement (A004) — pures, sans framework.
 * Un modèle décrit entièrement un comportement de prospection : prompt,
 * champs à extraire (dont champs fichier), rendu du livrable.
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
};

export type ChatTemplate = {
  id: string;
  organizationId: string;
  key: string;
  label: string;
  description: string;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatTemplateVersion = {
  id: string;
  templateId: string;
  version: number;
  definition: TemplateDefinition;
  createdBy: string | null;
  createdAt: string;
};
