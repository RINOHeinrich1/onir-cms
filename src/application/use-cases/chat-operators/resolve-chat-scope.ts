import { type Actor, organizationOf } from "@/application/actor";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";

/**
 * Portée de lecture/intervention d'un acteur sur les conversations.
 * `null` = aucun filtre (admin, marketeur, lecteur, opérateur « tous les liens »).
 * Un tableau = uniquement ces liens ; un tableau vide ne donne accès à rien.
 */
export async function resolveConversationLinkScope(
  scopes: ChatOperatorScopeRepository,
  actor: Actor,
): Promise<string[] | null> {
  if (actor.isSuperAdmin || actor.role !== "operateur") return null;

  const scope = await scopes.findForUser(organizationOf(actor), actor.id);
  if (scope === null || scope.allLinks) return null;
  return scope.linkIds;
}
