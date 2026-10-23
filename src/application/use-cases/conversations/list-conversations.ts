import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type {
  ConversationRepository,
  ConversationStatusCounts,
  ConversationSummary,
} from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type {
  ChatLink,
  ChatMessage,
  Conversation,
  ConversationFilter,
} from "@/domain/entities/chat";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";

export type ListConversationsDependencies = {
  conversations: ConversationRepository;
};

/** US-CONVERS-001 — liste des conversations filtrée par statut (serveur). */
/** US-CONVERS-003 — archive / désarchive une conversation (admin/marketeur). */
export async function archiveConversation(
  deps: ListConversationsDependencies,
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
  return deps.conversations.listWithDetails(organizationOf(actor), filter, linkLabel);
}

/** Vue globale — compteurs de conversations actives par statut. */
export async function countConversations(
  deps: ListConversationsDependencies,
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
  links: ChatLinkRepository;
  prospects: ProspectRepository;
  fiches: FicheRepository;
};

/** US-CONVERS-001 — détail d'une conversation : transcript + contexte. */
export async function getConversation(
  deps: GetConversationDependencies,
  actor: Actor,
  id: string,
): Promise<ConversationDetail> {
  assertCan(actor, "conversations:read");

  const organizationId = organizationOf(actor);
  const conversation = await deps.conversations.findById(organizationId, id);
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
