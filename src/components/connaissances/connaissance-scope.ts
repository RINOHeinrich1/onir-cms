import type { ChatLinkOption } from "@/components/ui/chat-link-options";

export const GLOBAL_SCOPE = "__global__";

type ScopeItem = { chatLinkIds: readonly string[] };

/** Une connaissance globale n'a aucun chatbot ; sinon elle doit contenir l'un des chatbots filtrés. */
export function matchesScope(item: ScopeItem, selectedScopes: readonly string[]): boolean {
  if (selectedScopes.length === 0) return true;
  return selectedScopes.some((scope) =>
    scope === GLOBAL_SCOPE ? item.chatLinkIds.length === 0 : item.chatLinkIds.includes(scope),
  );
}

/**
 * Options de portée réellement utiles : Globale + chatbots associés à au moins
 * une connaissance. Évite de noyer le filtre avec 100 chatbots inutilisés.
 */
export function scopeFilterOptions(
  connaissances: readonly ScopeItem[],
  chatbots: readonly ChatLinkOption[],
): { value: string; label: string }[] {
  const labels = new Map(chatbots.map((chatbot) => [chatbot.id, chatbot.label]));
  const usedIds = [...new Set(connaissances.flatMap((item) => item.chatLinkIds))];
  const chatbotOptions = usedIds
    .map((id) => ({ value: id, label: labels.get(id) ?? "Chatbot indisponible" }))
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));

  return [{ value: GLOBAL_SCOPE, label: "Globale" }, ...chatbotOptions];
}
