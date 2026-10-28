import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, UnprocessableError, ValidationError } from "@/application/errors";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import type { ChatMessage, Conversation } from "@/domain/entities/chat";

export type InterveneDependencies = {
  conversations: ConversationRepository;
  operatorScopes: ChatOperatorScopeRepository;
};

const MAX_CONTENT_LENGTH = 4000;

async function scopedConversation(
  deps: InterveneDependencies,
  actor: Actor,
  conversationId: string,
): Promise<Conversation> {
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(
    organizationId,
    conversationId,
    allowedLinkIds,
  );
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  return conversation;
}

/** Message d'un opérateur + prise en main atomiques (ADR-0043). */
export async function replyAsOperator(
  deps: InterveneDependencies,
  actor: Actor,
  conversationId: string,
  contentInput: unknown,
): Promise<{ message: ChatMessage; conversation: Conversation }> {
  assertCan(actor, "conversations:intervene");
  const content = typeof contentInput === "string" ? contentInput.trim() : "";
  if (content === "") throw new ValidationError("Message vide");
  if (content.length > MAX_CONTENT_LENGTH) {
    throw new ValidationError(`Message trop long (${MAX_CONTENT_LENGTH} caractères maximum)`);
  }

  const conversation = await scopedConversation(deps, actor, conversationId);
  if (conversation.statut === "finalisee") {
    throw new UnprocessableError("Conversation finalisée : impossible d'intervenir");
  }

  const result = await deps.conversations.appendOperatorMessage(
    organizationOf(actor),
    conversationId,
    content,
    actor.id,
  );
  if (result === null) {
    throw new UnprocessableError("Conversation finalisée : impossible d'intervenir");
  }
  return result;
}

export async function takeOverConversation(
  deps: InterveneDependencies,
  actor: Actor,
  conversationId: string,
): Promise<Conversation> {
  assertCan(actor, "conversations:intervene");
  const conversation = await scopedConversation(deps, actor, conversationId);
  if (conversation.statut === "finalisee") {
    throw new UnprocessableError("Conversation finalisée : impossible de prendre la main");
  }
  const updated = await deps.conversations.takeOverConversation(
    organizationOf(actor),
    conversationId,
    actor.id,
  );
  if (updated === null) {
    throw new UnprocessableError("Conversation finalisée : impossible de prendre la main");
  }
  return updated;
}

export async function releaseConversation(
  deps: InterveneDependencies,
  actor: Actor,
  conversationId: string,
): Promise<Conversation> {
  assertCan(actor, "conversations:intervene");
  await scopedConversation(deps, actor, conversationId);
  const updated = await deps.conversations.releaseConversation(
    organizationOf(actor),
    conversationId,
  );
  if (updated === null) throw new NotFoundError("Conversation introuvable");
  return updated;
}
