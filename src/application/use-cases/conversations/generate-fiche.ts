import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import {
  buildFicheFromConversation,
  type FinishConversationDependencies,
  type FinishedConversation,
} from "@/application/use-cases/chat/finish-conversation";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";

export type GenerateFicheDependencies = FinishConversationDependencies & {
  operatorScopes: ChatOperatorScopeRepository;
};

/**
 * US-CONVERS-002 — génère une fiche à partir d'une conversation existante
 * (opérateur, admin/marketeur), même si le visiteur n'a pas cliqué « Terminer ».
 * Une conversation peut porter **plusieurs fiches** : chaque appel crée une
 * nouvelle fiche. Le **statut de la conversation n'est pas modifié** (seule la
 * fin de discussion par le visiteur passe en `finalisee`).
 */
export async function generateFicheFromConversation(
  deps: GenerateFicheDependencies,
  actor: Actor,
  conversationId: string,
): Promise<FinishedConversation> {
  assertCan(actor, "conversations:generate_fiche");

  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);
  const conversation = await deps.conversations.findById(
    organizationOf(actor),
    conversationId,
    allowedLinkIds,
  );
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  return buildFicheFromConversation(deps, conversation, actor.id);
}
