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
import {
  type SendMessageDependencies,
  sendMessage,
} from "@/application/use-cases/chat/send-message";
import type { StartConversationDependencies } from "@/application/use-cases/chat/start-conversation";
import { startConversation } from "@/application/use-cases/chat/start-conversation";
import { channelsForLink } from "@/domain/entities/chat";
import { decryptLinkToken } from "@/lib/link-crypto";

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

export type CreateConversationApiInput = {
  visitor?: unknown;
  consentement?: unknown;
  channel?: "page" | "widget";
};

export type CreateConversationApiDependencies = StartConversationDependencies & {
  fiches: FicheRepository;
};

/** Crée ou reprend une conversation publique pour un chatbot (API key). */
export async function createConversationForApi(
  deps: CreateConversationApiDependencies,
  organizationId: string,
  chatbotId: string,
  input: CreateConversationApiInput,
) {
  const link = await deps.links.findById(organizationId, chatbotId);
  if (link === null || !link.actif) throw new NotFoundError("Chatbot introuvable");

  const tokenEnc = await deps.links.getTokenEnc(organizationId, chatbotId);
  if (tokenEnc === null) throw new NotFoundError("Chatbot sans lien public");
  const token = decryptLinkToken(tokenEnc);
  const channels = channelsForLink(link);
  const channel =
    input.channel ?? (channels.page.enabled ? "page" : channels.widget.enabled ? "widget" : null);
  if (channel === null) throw new NotFoundError("Aucun canal de discussion disponible");

  const started = await startConversation(deps, {
    token,
    visitor: input.visitor,
    consentement: input.consentement,
    channel,
  });
  const detail = await getConversationForApi(deps, organizationId, started.conversation.id);
  return { ...detail, resumed: started.resumed };
}

/** Envoie un message visiteur et renvoie la réponse éventuelle du chatbot (API key). */
export async function sendMessageForApi(
  deps: SendMessageDependencies,
  organizationId: string,
  conversationId: string,
  input: { content?: unknown; attachmentIds?: unknown },
) {
  const conversation = await deps.conversations.findById(organizationId, conversationId);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  const result = await sendMessage(deps, {
    conversationId,
    content: input.content,
    attachmentIds: input.attachmentIds,
  });
  return {
    userMessage: messageDto(result.userMessage),
    message: result.message === null ? null : messageDto(result.message),
    connaissances: result.connaissances,
    mediaPending: result.mediaPending,
    mode: result.mode,
  };
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
