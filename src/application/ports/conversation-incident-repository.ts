import type { ConversationIncidentKind } from "@/domain/entities/conversation-incident";

export type ConversationIncidentRecord = {
  id: string;
  organizationId: string;
  conversationId: string;
  kind: ConversationIncidentKind;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
  status: "open" | "resolved";
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  visitorNom: string;
  visitorEmail: string;
  linkLabel: string;
};

export type RecordConversationIncidentInput = {
  organizationId: string;
  conversationId: string;
  kind: ConversationIncidentKind;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
};

export interface ConversationIncidentRepository {
  record(input: RecordConversationIncidentInput): Promise<void>;
  listOpen(
    organizationId: string,
    allowedLinkIds: string[] | null,
  ): Promise<ConversationIncidentRecord[]>;
  countOpen(organizationId: string, allowedLinkIds: string[] | null): Promise<number>;
  listForConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationIncidentRecord[]>;
  resolve(
    organizationId: string,
    incidentId: string,
    userId: string,
    allowedLinkIds: string[] | null,
  ): Promise<ConversationIncidentRecord | null>;
}
