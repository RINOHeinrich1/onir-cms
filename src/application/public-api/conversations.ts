import { NotFoundError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type {
  ConversationRepository,
  ConversationSummary,
} from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import {
  conversationDto,
  conversationSummaryDto,
  ficheDto,
  messageDto,
} from "@/application/public-api/dto";
import type { ApiCursor, ApiSort } from "@/application/public-api/pagination";
import { paginateByCreatedAt } from "@/application/public-api/pagination";

export type ConversationListCriteria = {
  status: "en_cours" | "finalisees" | "toutes" | "archivees";
  chatbotId: string | null;
  prospectId: string | null;
  q: string | null;
  limit: number;
  cursor: ApiCursor | null;
  sort: ApiSort;
};

function matches(summary: ConversationSummary, criteria: ConversationListCriteria): boolean {
  if (criteria.chatbotId !== null && summary.linkId !== criteria.chatbotId) return false;
  if (criteria.prospectId !== null && summary.prospectId !== criteria.prospectId) return false;
  if (criteria.q !== null) {
    const needle = criteria.q.toLowerCase();
    const haystack =
      `${summary.visitorNom} ${summary.visitorEmail} ${summary.linkLabel}`.toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

export async function listConversationsForApi(
  deps: { conversations: ConversationRepository },
  organizationId: string,
  criteria: ConversationListCriteria,
) {
  const conversations = await deps.conversations.listWithDetails(organizationId, criteria.status);
  const filtered = conversations.filter((conversation) => matches(conversation, criteria));
  const page = paginateByCreatedAt(filtered, criteria.limit, criteria.cursor, criteria.sort);
  return {
    data: page.data.map(conversationSummaryDto),
    pagination: page.pagination,
  };
}

export async function getConversationForApi(
  deps: {
    conversations: ConversationRepository;
    links: ChatLinkRepository;
    prospects: ProspectRepository;
    fiches: FicheRepository;
  },
  organizationId: string,
  id: string,
) {
  const conversation = await deps.conversations.findById(organizationId, id);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  const [messages, chatbot, prospect, fiches] = await Promise.all([
    deps.conversations.listMessages(organizationId, id),
    deps.links.findById(organizationId, conversation.linkId),
    conversation.prospectId === null
      ? Promise.resolve(null)
      : deps.prospects.findById(organizationId, conversation.prospectId),
    deps.fiches.listByConversation(organizationId, id),
  ]);
  return {
    conversation: conversationDto(conversation),
    messages: messages.map(messageDto),
    chatbot:
      chatbot === null
        ? null
        : {
            id: chatbot.id,
            label: chatbot.label,
            type: chatbot.type,
          },
    prospect:
      prospect === null
        ? null
        : {
            id: prospect.id,
            nom: prospect.nom,
            prenom: prospect.prenom,
            email: prospect.email,
            contactMissing: prospect.contactMissing,
          },
    fiches: fiches.map(ficheDto),
  };
}

export async function listConversationMessagesForApi(
  deps: { conversations: ConversationRepository },
  organizationId: string,
  conversationId: string,
  limit: number,
  cursor: ApiCursor | null,
  sort: ApiSort,
) {
  const conversation = await deps.conversations.findById(organizationId, conversationId);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  const messages = await deps.conversations.listMessages(organizationId, conversationId);
  const page = paginateByCreatedAt(messages, limit, cursor, sort);
  return {
    data: page.data.map(messageDto),
    pagination: page.pagination,
  };
}

export async function listConversationFichesForApi(
  deps: { conversations: ConversationRepository; fiches: FicheRepository },
  organizationId: string,
  conversationId: string,
) {
  const conversation = await deps.conversations.findById(organizationId, conversationId);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  const fiches = await deps.fiches.listByConversation(organizationId, conversationId);
  return fiches.map(ficheDto);
}

export async function closeConversationForApi(
  deps: { conversations: ConversationRepository },
  organizationId: string,
  conversationId: string,
): Promise<void> {
  const conversation = await deps.conversations.findById(organizationId, conversationId);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  await deps.conversations.markFinalisee(organizationId, conversationId);
}
