// Rythme de frappe du dialogue (logique PURE, sans DOM) : 4.26.0.
//
// Le texte est révélé caractère par caractère. Une micro-pause suit chaque fin
// de phrase (`!`, `.`, `?`, `…`) et chaque changement de bloc (paragraphe,
// item de liste) pour rendre la lecture naturelle ; rien ne bloque l'affichage
// (aucune requête : le découpage est purement frontend).

/** Délai de base entre deux caractères. */
export const TYPE_CHAR_MS = 18;
/** Micro-pause après le DERNIER caractère d'une fin de phrase (« ?! » = une pause). */
export const TYPE_SENTENCE_PAUSE_MS = 260;
/** Pause entre deux blocs (paragraphe, item de liste, titre). */
export const TYPE_PARAGRAPH_PAUSE_MS = 200;
/** Pause avant de continuer sur la page suivante d'un message long. */
export const TYPE_PAGE_PAUSE_MS = 700;

const SENTENCE_END = new Set([".", "!", "?", "…"]);

/** Vrai si `ch` termine une phrase (ponctuation forte). */
export function isSentenceEnd(ch) {
  return typeof ch === "string" && ch.length === 1 && SENTENCE_END.has(ch);
}

/**
 * Délai avant d'afficher le caractère SUIVANT, d'après le caractère courant et
 * le suivant. Une suite de ponctuations fortes (« ?! ») ne cumule pas les
 * pauses : seule la dernière déclenche la micro-pause.
 */
export function charDelay(ch, next = "") {
  if (ch === "\n" || ch === "\r") return TYPE_PARAGRAPH_PAUSE_MS;
  if (isSentenceEnd(ch) && !isSentenceEnd(next)) return TYPE_SENTENCE_PAUSE_MS;
  return TYPE_CHAR_MS;
}
