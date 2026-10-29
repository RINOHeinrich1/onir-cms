/**
 * Portée d'un élément du mini-RAG (connaissance, média) : liste des chatbots
 * qui peuvent le voir. Liste vide = portée globale (tous les chatbots).
 *
 * Remplace l'ancienne portée par modèle de raisonnement (`templateKeys`).
 * La colonne `template_keys` reste en base pour le runtime legacy, mais elle
 * n'est plus exposée ni utilisée pour les nouveaux chatbots.
 */

/** Nombre maximal de chatbots référencés par une portée. */
export const CHAT_LINK_IDS_MAX = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ChatLinkScopeResult = { ok: true; ids: string[] } | { ok: false; message: string };

/**
 * Normalise une portée brute : tableau d'identifiants de chatbots, doublons
 * et vides supprimés. Un tableau vide (ou absent) signifie « global ».
 */
export function normalizeChatLinkIds(value: unknown): ChatLinkScopeResult {
  const raw = Array.isArray(value) ? value : value === undefined || value === null ? [] : null;
  if (raw === null) {
    return { ok: false, message: "Portée invalide" };
  }

  const ids: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return { ok: false, message: "Portée invalide" };
    }
    const id = entry.trim();
    if (id === "" || ids.includes(id)) continue;
    if (!UUID_PATTERN.test(id)) {
      return { ok: false, message: "Portée invalide : identifiant de chatbot attendu" };
    }
    ids.push(id);
  }
  if (ids.length > CHAT_LINK_IDS_MAX) {
    return {
      ok: false,
      message: `Portée trop large (${CHAT_LINK_IDS_MAX} chatbots maximum)`,
    };
  }
  return { ok: true, ids };
}

/** Lit la portée d'un objet brut (`chatLinkIds`). */
export function readChatLinkIds(source: Record<string, unknown>): ChatLinkScopeResult {
  return normalizeChatLinkIds(source.chatLinkIds);
}

/** Indique si l'objet brut porte une information de portée. */
export function hasChatLinkIds(source: Record<string, unknown>): boolean {
  return "chatLinkIds" in source;
}
