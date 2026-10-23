/** Types DTO côté client pour les modèles (US-TEMPLATE-001). */

export type TemplateSummary = {
  id: string;
  key: string;
  label: string;
  description: string;
  createdBy: string | null;
  createdByLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TemplateFieldDraft = {
  name: string;
  label: string;
  type: string;
  required: boolean;
  options: string;
  requiredIfField: string;
  requiredIfEquals: string;
  example: string;
};

export type TemplateFormMode = "simple" | "expert";

export type TemplateSeed = {
  key: string;
  label: string;
  description: string;
  definition: Record<string, unknown>;
};

export type TemplateDetail = {
  template: TemplateSummary;
  currentVersion: number;
  references: { links: boolean; fiches: boolean };
};

export type TemplatePreviewResult = {
  systemPrompt: string;
  markdown: string;
};

export const EMPTY_FIELD: TemplateFieldDraft = {
  name: "",
  label: "",
  type: "text",
  required: false,
  options: "",
  requiredIfField: "",
  requiredIfEquals: "",
  example: "",
};
