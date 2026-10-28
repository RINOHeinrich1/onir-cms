import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationIncidentRepository } from "@/application/ports/conversation-incident-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import {
  CONVERSATION_INCIDENT_KINDS,
  type ConversationIncidentKind,
  type ConversationIncidentSeverity,
  INCIDENT_LABELS,
} from "@/domain/entities/conversation-incident";

export type RecordIncidentDependencies = {
  conversations: ConversationRepository;
  links: ChatLinkRepository;
  incidents: ConversationIncidentRepository;
};

export type ConversationIncidentDependencies = {
  conversations: ConversationRepository;
  operatorScopes: ChatOperatorScopeRepository;
  incidents: ConversationIncidentRepository;
};

function isKind(value: string): value is ConversationIncidentKind {
  return (CONVERSATION_INCIDENT_KINDS as readonly string[]).includes(value);
}

function truncate(value: string, max = 240): string {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Enregistre une erreur technique sans jamais bloquer le flux appelant. */
export async function recordConversationIncident(
  deps: RecordIncidentDependencies,
  input: {
    conversationId: string;
    kind: ConversationIncidentKind;
    severity?: ConversationIncidentSeverity;
    detail: string;
  },
): Promise<void> {
  try {
    const conversation = await deps.conversations.findByIdPublic(input.conversationId);
    if (conversation === null) return;
    const link = await deps.links.findById(conversation.organizationId, conversation.linkId);
    const visitor =
      conversation.visitorNom.trim() || conversation.visitorEmail.trim() || "Visiteur anonyme";
    const context = link === null ? "" : ` · ${link.label}`;
    await deps.incidents.record({
      organizationId: conversation.organizationId,
      conversationId: conversation.id,
      kind: input.kind,
      severity: input.severity ?? (input.kind === "ai_reply_failed" ? "high" : "medium"),
      title: INCIDENT_LABELS[input.kind],
      detail: truncate(`${visitor}${context} — ${input.detail}`),
    });
  } catch {
    // Une alerte ne doit jamais masquer l'erreur d'origine.
  }
}

export async function listConversationIncidents(
  deps: ConversationIncidentDependencies,
  actor: Actor,
  conversationId: string,
) {
  assertCan(actor, "conversations:read");
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(
    organizationId,
    conversationId,
    allowedLinkIds,
  );
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  return deps.incidents.listForConversation(organizationId, conversationId);
}

export async function resolveConversationIncident(
  deps: ConversationIncidentDependencies,
  actor: Actor,
  incidentId: string,
) {
  assertCan(actor, "conversations:intervene");
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const resolved = await deps.incidents.resolve(
    organizationId,
    incidentId,
    actor.id,
    allowedLinkIds,
  );
  if (resolved === null) throw new NotFoundError("Incident introuvable");
  return resolved;
}

export function incidentKindLabel(kind: string): string {
  return isKind(kind) ? INCIDENT_LABELS[kind] : "Incident";
}
