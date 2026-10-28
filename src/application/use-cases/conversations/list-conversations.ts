import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type {
  ConversationRepository,
  ConversationStatusCounts,
  ConversationSummary,
} from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import type {
  ChatLink,
  ChatMessage,
  Conversation,
  ConversationFilter,
} from "@/domain/entities/chat";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";

export type ConversationsDependency = {
  conversations: ConversationRepository;
};

export type ListConversationsDependencies = ConversationsDependency & {
  operatorScopes: ChatOperatorScopeRepository;
};

/** US-CONVERS-001 — liste des conversations filtrée par statut (serveur). */
/** US-CONVERS-003 — archive / désarchive une conversation (admin/marketeur). */
export async function archiveConversation(
  deps: ConversationsDependency,
  actor: Actor,
  id: string,
  archivee: boolean,
): Promise<void> {
  assertCan(actor, "conversations:update");
  const ok = await deps.conversations.setArchivee(organizationOf(actor), id, archivee);
  if (!ok) {
    throw new NotFoundError("Conversation introuvable");
  }
}

export async function listConversations(
  deps: ListConversationsDependencies,
  actor: Actor,
  filter: ConversationFilter = "en_cours",
  linkLabel: string | null = null,
): Promise<ConversationSummary[]> {
  assertCan(actor, "conversations:list");
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  return deps.conversations.listWithDetails(
    organizationOf(actor),
    filter,
    linkLabel,
    allowedLinkIds,
  );
}

/** Vue globale — compteurs de conversations actives par statut. */
export async function countConversations(
  deps: ConversationsDependency,
  actor: Actor,
): Promise<ConversationStatusCounts> {
  assertCan(actor, "conversations:list");
  return deps.conversations.countByStatut(organizationOf(actor));
}

export type ConversationDetail = {
  conversation: Conversation;
  messages: ChatMessage[];
  link: ChatLink | null;
  prospect: Prospect | null;
  /** Fiches rattachées (0..N). */
  fiches: Fiche[];
};

export type GetConversationDependencies = {
  conversations: ConversationRepository;
  operatorScopes: ChatOperatorScopeRepository;
  links: ChatLinkRepository;
  prospects: ProspectRepository;
  fiches: FicheRepository;
};

export type ConversationUpdatesDependencies = {
  conversations: ConversationRepository;
  operatorScopes: ChatOperatorScopeRepository;
};

export type ConversationUpdates = {
  conversation: Conversation;
  messages: ChatMessage[];
};

/** Polling/SSE : état courant + messages postérieurs à `after`, scopés. */
export async function getConversationUpdates(
  deps: ConversationUpdatesDependencies,
  actor: Actor,
  id: string,
  after: string | null,
): Promise<ConversationUpdates> {
  assertCan(actor, "conversations:read");
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(organizationId, id, allowedLinkIds);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const normalizedAfter =
    after !== null && !Number.isNaN(new Date(after).getTime())
      ? new Date(after).toISOString()
      : null;
  const messages = await deps.conversations.listMessagesAfter(organizationId, id, normalizedAfter);
  return { conversation, messages };
}

/** US-CONVERS-001 — détail d'une conversation : transcript + contexte. */
export async function getConversation(
  deps: GetConversationDependencies,
  actor: Actor,
  id: string,
): Promise<ConversationDetail> {
  assertCan(actor, "conversations:read");

  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(organizationId, id, allowedLinkIds);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  const [messages, link, prospect, fiches] = await Promise.all([
    deps.conversations.listMessages(organizationId, id),
    deps.links.findById(organizationId, conversation.linkId),
    conversation.prospectId === null
      ? Promise.resolve(null)
      : deps.prospects.findById(organizationId, conversation.prospectId),
    deps.fiches.listByConversation(organizationId, id),
  ]);
  return { conversation, messages, link, prospect, fiches };
}
