export const CONVERSATION_INCIDENT_KINDS = [
  "ai_reply_failed",
  "fiche_generation_failed",
  "field_extraction_failed",
] as const;

export type ConversationIncidentKind = (typeof CONVERSATION_INCIDENT_KINDS)[number];
export type ConversationIncidentSeverity = "low" | "medium" | "high" | "critical";

export const INCIDENT_LABELS: Record<ConversationIncidentKind, string> = {
  ai_reply_failed: "Réponse IA impossible",
  fiche_generation_failed: "Génération de fiche impossible",
  field_extraction_failed: "Analyse des informations impossible",
};
