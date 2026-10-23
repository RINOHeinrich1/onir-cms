// Pagination MESURÉE du message affiché dans le dialogue : 4.26.0.
//
// Le message Markdown complet est rendu dans une sonde invisible de la MÊME
// largeur/hauteur que la bulle réelle, puis réparti en pages :
//  - on empile les blocs (paragraphes, listes, titres) tant que ça tient ;
//  - un bloc plus haut qu'une page est coupé AU MOT (Range sur les nœuds
//    texte → le gras/italique/liens du bloc restent intacts) ;
//  - la page 2+ reçoit le marqueur « … » en tête, toute page non finale reçoit
//    le marqueur en pied (positionné, donc sans impact sur la mesure).
//
// Aucune requête réseau : tout se calcule côté front, une seule fois par
// message et par taille (resize).

import { PAGE_MARK, splitAtWord } from "../lib/pagination.js";

const TEXT_NODES = 4; // NodeFilter.SHOW_TEXT
const BLOCK_TAGS = new Set(["DIV", "UL", "OL", "LI", "P", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "PRE"]);

const isBlock = (node) => !!node && node.nodeType === 1 && BLOCK_TAGS.has(node.tagName);

/**
 * Un `<br>` ENTRE deux blocs (rendu Markdown des paragraphes) ne produit aucun
 * saut de ligne visible : il ne consomme que de la place mesurée. On l'écarte
 * pour que la pagination colle au rendu réel.
 */
export function dropRedundantBreaks(nodes) {
  return nodes.filter((node, i, arr) => {
    if (!(node.nodeType === 1 && node.tagName === "BR")) return true;
    return !(isBlock(arr[i - 1]) && isBlock(arr[i + 1]));
  });
}

function makeProbe(host, width, height, role) {
  const probe = document.createElement("div");
  probe.className = `bubble ${role === "user" ? "user" : "assistant"} probe`;
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = [
    "position:absolute",
    "left:0",
    "top:0",
    "visibility:hidden",
    "pointer-events:none",
    "z-index:-1",
    "box-sizing:border-box",
    `width:${Math.max(1, Math.round(width))}px`,
    `height:${Math.max(1, Math.round(height))}px`,
    "max-width:none",
    "max-height:none",
    "overflow:hidden",
  ].join(";");
  host.appendChild(probe);
  return probe;
}

function textEntries(block) {
  const walker = document.createTreeWalker(block, TEXT_NODES);
  const entries = [];
  let offset = 0;
  let node = walker.nextNode();
  while (node) {
    const len = node.nodeValue?.length ?? 0;
    if (len > 0) {
      entries.push({ node, start: offset, len });
      offset += len;
    }
    node = walker.nextNode();
  }
  return entries;
}

function locate(entries, offset) {
  for (const entry of entries) {
    if (offset <= entry.start + entry.len) {
      return { node: entry.node, offset: Math.min(entry.len, Math.max(0, offset - entry.start)) };
    }
  }
  const last = entries[entries.length - 1];
  return { node: last.node, offset: last.len };
}

/** Copie d'un bloc bornée à `[from, to)` caractères de son texte (balises préservées). */
function sliceBlock(block, from, to) {
  const entries = textEntries(block);
  if (entries.length === 0) return block.cloneNode(true);
  const range = document.createRange();
  const a = locate(entries, from);
  const b = locate(entries, to);
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const clone = block.cloneNode(false);
  clone.appendChild(range.cloneContents());
  return clone;
}

/** Coupe un bloc trop haut : plus long préfixe qui tient (frontière de mot). */
function splitBlock(block, fitsSlice) {
  const text = block.textContent ?? "";
  const total = text.length;
  if (total === 0) return [block.cloneNode(true), null];
  let lo = 1;
  let hi = total;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const n = splitAtWord(text, mid);
    if (n <= 0) {
      hi = mid - 1;
      continue;
    }
    if (fitsSlice(sliceBlock(block, 0, n))) {
      best = n;
      // Bisection sur `mid` (la coupe au mot `n` peut être BEAUCOUP plus courte
      // que `mid` : avancer de `n` rendrait la recherche quasi linéaire).
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  // Aucune frontière de mot sûre : on ne coupe pas au caractère. Le bloc
  // entier passe à la page suivante (ou déborde seul s'il est plus haut
  // qu'une page, cas d'un unique mot/URL).
  if (best <= 0) return [null, block.cloneNode(true)];
  if (best >= total) return [block.cloneNode(true), null];
  return [sliceBlock(block, 0, best), sliceBlock(block, best, total)];
}

function prefixNodes(mark) {
  if (!mark) return [];
  const span = document.createElement("span");
  span.className = "cont-start";
  span.dataset.static = "1";
  span.textContent = `${mark} `;
  return [span];
}

/**
 * Découpe `html` en pages qui tiennent dans la bulle de dimensions données.
 * @returns {Array<{nodes: Node[], mark: string}>}
 */
export function paginateBubble({ host, html, width, height, role = "assistant" }) {
  if (!(width > 8) || !(height > 8)) {
    const only = document.createElement("div");
    only.innerHTML = html;
    return [{ nodes: [...only.childNodes], mark: "" }];
  }
  const probe = makeProbe(host, width, height, role);
  try {
    probe.innerHTML = html;
    const source = dropRedundantBreaks([...probe.childNodes]);
    if (source.length === 0) return [{ nodes: [], mark: "" }];

    const fits = (nodes, mark) => {
      probe.replaceChildren(...prefixNodes(mark), ...nodes.map((n) => n.cloneNode(true)));
      return probe.scrollHeight <= probe.clientHeight + 1;
    };

    const pages = [];
    const pending = source.map((n) => n.cloneNode(true));
    while (pending.length > 0) {
      const mark = pages.length > 0 ? PAGE_MARK : "";
      const nodes = [];
      while (pending.length > 0) {
        const candidate = pending[0];
        nodes.push(candidate);
        if (fits(nodes, mark)) {
          pending.shift();
          continue;
        }
        nodes.pop();
        // Le bloc ne tient pas en entier : on remplit la place restante AU MOT
        // (le marqueur « … » signale la reprise sur la page suivante).
        const [head, tail] = splitBlock(candidate, (slice) => fits([...nodes, slice], mark));
        if (head === null) {
          // Aucune coupe au mot : page suivante si on a déjà du contenu,
          // sinon on affiche le bloc entier (débordement contrôlé).
          if (nodes.length === 0) {
            nodes.push(candidate);
            pending.shift();
          }
          break;
        }
        if (!tail) {
          nodes.push(head);
          pending.shift();
          break;
        }
        // On n'ajoute la coupe partielle que si elle tient RÉELLEMENT (page vide :
        // garantie de progrès, un mot plus haut qu'une page ne peut pas être coupé).
        if (nodes.length === 0 || fits([...nodes, head], mark)) {
          nodes.push(head);
          pending[0] = tail;
          break;
        }
        break; // aucune coupe utile : le bloc entier passe à la page suivante
      }
      if (nodes.length === 0) {
        // Sécurité anti-boucle : jamais de page vide (bloc non textuel trop haut).
        nodes.push(pending.shift());
      }
      pages.push({ nodes, mark });
    }
    return pages;
  } finally {
    probe.remove();
  }
}
