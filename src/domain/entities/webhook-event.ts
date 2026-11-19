import type { TemplateDefinition } from "@/domain/entities/chat-template";

export const FICHE_WEBHOOK_EVENT_TYPES = [
  "fiche.draft.all_fields_filled",
  "fiche.draft.field_filled",
  "fiche.draft.fields_filled",
  "fiche.draft.required_fields_filled",
  "fiche.validated",
] as const;

export type FicheWebhookEventType = (typeof FICHE_WEBHOOK_EVENT_TYPES)[number];

export const FICHE_EVENT_STATUSES = [
  "pending",
  "dispatched",
  "failed",
  "payload_incomplete",
] as const;

export type FicheEventStatus = (typeof FICHE_EVENT_STATUSES)[number];

export type FicheEventPayload = {
  ficheKey: string;
  ficheLabel: string;
  definition: TemplateDefinition;
  data: Record<string, unknown>;
  missingFields: string[];
  attachmentCounts?: Readonly<Record<string, number>>;
  status: string;
  conversationId: string;
  prospectId: string | null;
  chatLinkId: string;
  configId: string | null;
  occurredAt: string;
};

export type FicheLifecycleEvent = {
  id: string;
  organizationId: string;
  eventType: FicheWebhookEventType;
  source: "draft" | "fiche";
  chatLinkId: string | null;
  configId: string | null;
  ficheKey: string;
  conversationId: string | null;
  ficheInstanceId: string | null;
  ficheId: string | null;
  fieldKey: string | null;
  fieldKeys?: string[] | null;
  status: FicheEventStatus;
  payload: FicheEventPayload;
  occurredAt: string;
  dispatchedAt: string | null;
  errorMessage: string | null;
};

export function isFicheWebhookEventType(value: string): value is FicheWebhookEventType {
  return (FICHE_WEBHOOK_EVENT_TYPES as readonly string[]).includes(value);
}
