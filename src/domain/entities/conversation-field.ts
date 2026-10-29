import type { TemplateField, TemplateRequiredIf } from "@/domain/entities/chat-template";
import type { FicheInstanceStatus } from "@/domain/entities/conversation-fiche-instance";

export const CONVERSATION_FIELD_SOURCES = ["ai", "manual", "visitor", "system"] as const;
export type ConversationFieldSource = (typeof CONVERSATION_FIELD_SOURCES)[number];

export type ConversationFieldValue = {
  fieldName: string;
  value: unknown;
  source: ConversationFieldSource;
  updatedBy: string | null;
  updatedAt: string;
};

export type ConversationFieldAnalysis = {
  lastAnalyzedMessageAt: string | null;
  lastAnalyzedAt: string | null;
  status: "idle" | "ok" | "error";
  error: string | null;
};

/** Champ de template enrichi de sa valeur collectée et de son état courant. */
export type ConversationFieldView = TemplateField & {
  value: unknown;
  source: ConversationFieldSource | null;
  updatedAt: string | null;
  attachmentCount: number;
  requiredNow: boolean;
  missing: boolean;
};

/** Vue d'une fiche de collecte d'une conversation multi-fiches (ADR-0049). */
export type ConversationFicheView = {
  instanceId: string | null;
  ficheKey: string;
  label: string;
  status: FicheInstanceStatus;
  fields: ConversationFieldView[];
  requiredTotal: number;
  requiredCollected: number;
  requiredMissing: number;
  collectedTotal: number;
  total: number;
};

export type ConversationFieldsView = {
  conversationId: string;
  /** Configuration chatbot courante (null = champs legacy mono-modèle). */
  configId?: string | null;
  /** Fiches de collecte (config-only / multi-fiches). Absent = legacy. */
  fiches?: ConversationFicheView[];
  templateKey: string;
  templateVersion: number;
  templateLabel: string;
  fields: ConversationFieldView[];
  requiredTotal: number;
  requiredCollected: number;
  requiredMissing: number;
  collectedTotal: number;
  total: number;
  analysis: ConversationFieldAnalysis;
  stale: boolean;
  canEdit: boolean;
};

export type ConversationFieldUpdate = {
  fieldName: string;
  value: unknown;
  source: ConversationFieldSource;
  updatedBy: string | null;
};

export function isFieldEmpty(field: TemplateField, value: unknown): boolean {
  if (field.type === "multi") {
    return (
      !Array.isArray(value) || value.every((item) => typeof item !== "string" || item.trim() === "")
    );
  }
  return typeof value !== "string" || value.trim() === "";
}

export function isFieldRequired(
  field: TemplateField,
  values: Readonly<Record<string, unknown>>,
): boolean {
  if (field.required) return true;
  const condition: TemplateRequiredIf | undefined = field.requiredIf;
  if (condition === undefined) return false;
  const target = values[condition.field];
  return typeof target === "string" && target.trim() === condition.equals;
}
