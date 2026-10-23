import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import {
  buildFicheFromConversation,
  type FinishConversationDependencies,
  type FinishedConversation,
} from "@/application/use-cases/chat/finish-conversation";

export type GenerateFicheDependencies = FinishConversationDependencies;

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
  assertCan(actor, "project:write");

  const conversation = await deps.conversations.findById(organizationOf(actor), conversationId);
  if (conversation === null) {
    throw new NotFoundError("Conversation introuvable");
  }
  return buildFicheFromConversation(deps, conversation, actor.id);
}
