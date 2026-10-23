// Politique de pagination du dialogue (logique PURE, sans DOM) : 4.26.0.
//
// Un message long n'est plus défilant : il est découpé en PAGES de hauteur
// fixe. Les flèches ‹ › feuillettent d'abord les pages du message courant,
// puis passent au message précédent/suivant.

/** Marqueur de continuation (début de page 2+ ET fin de page tronquée). */
export const PAGE_MARK = "…";

/**
 * Coupe un texte à la longueur `max` sur une frontière de mot Unicode
 * (espaces, insécables, retours ligne…). Ne coupe JAMAIS au milieu d'un mot :
 * retourne 0 si aucune frontière suffisamment avancée n'existe ; l'appelant
 * déplace alors le bloc entier sur la page suivante.
 */
export function splitAtWord(text, max) {
  const src = String(text ?? "");
  if (src.length === 0) return 0;
  const limit = Math.max(1, Math.min(Math.floor(max), src.length));
  if (limit >= src.length) return src.length;
  let cut = 0;
  for (let i = limit - 1; i > 0; i -= 1) {
    if (/\s/u.test(src[i])) {
      cut = i;
      break;
    }
  }
  // Une frontière trop précoce (< 50 %) laisserait une page presque vide :
  // on préfère déplacer le bloc entier.
  if (cut <= 0 || cut < limit * 0.5) return 0;
  return cut;
}

/**
 * Décide ce que fait un appui sur ‹ (delta -1) ou › (delta +1) :
 * - `finish` : une frappe est en cours → on l'affiche immédiatement ;
 * - `page` : page suivante/précédente du message courant ;
 * - `message` : message suivant/précédent ;
 * - `none` : borne atteinte.
 */
export function resolveNav({ typing = false, pageIdx = 0, pageCount = 1, msgIdx = 0, msgCount = 1, delta = 0 } = {}) {
  if (typing) return "finish";
  if (delta === 0) return "none";
  if (delta > 0) {
    if (pageIdx < pageCount - 1) return "page";
    if (msgIdx < msgCount - 1) return "message";
    return "none";
  }
  if (pageIdx > 0) return "page";
  if (msgIdx > 0) return "message";
  return "none";
}

/** Folio : « 2 / 7 » ou « 2 / 7 · 3/4 » quand le message est paginé. */
export function pageLabel({ msgIdx = 0, msgCount = 0, pageIdx = 0, pageCount = 1 } = {}) {
  if (msgCount <= 0) return "0 / 0";
  const current = `${msgIdx + 1} / ${msgCount}`;
  return pageCount > 1 ? `${current} · ${pageIdx + 1}/${pageCount}` : current;
}
