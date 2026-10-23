// Frappe progressive (typewriter) du contenu d'une bulle : 4.26.0.
// Le texte est déjà dans le DOM (paginé) : on le révèle caractère par
// caractère, sans toucher à la structure (gras, italique, liens, code).
// Les marqueurs de page (`[data-static]`) sont affichés immédiatement.

import { TYPE_PARAGRAPH_PAUSE_MS, charDelay } from "../lib/typewriter.js";

const TEXT_NODES = 4; // NodeFilter.SHOW_TEXT

function blockOf(node) {
  let el = node.parentElement;
  while (el && !el.matches("div,li,ul,br")) el = el.parentElement;
  return el;
}

/**
 * Révèle progressivement les nœuds texte de `el`.
 * @returns {{ finish: () => void, cancel: () => void, isTyping: () => boolean }}
 */
export function typeInto(el, { onDone } = {}) {
  const walker = document.createTreeWalker(el, TEXT_NODES);
  const items = [];
  let node = walker.nextNode();
  while (node) {
    const text = node.nodeValue ?? "";
    if (text.length > 0 && !node.parentElement?.closest("[data-static]")) {
      items.push({ node, text, block: blockOf(node) });
    }
    node = walker.nextNode();
  }

  let state = "idle";
  let timer = 0;

  if (items.length === 0) {
    state = "done";
    onDone?.();
    return { finish() {}, cancel() {}, isTyping: () => false };
  }

  const stream = [];
  for (const item of items) {
    for (let k = 0; k < item.text.length; k += 1) {
      stream.push({ node: item.node, ch: item.text[k], block: item.block });
    }
  }

  state = "typing";
  for (const item of items) item.node.nodeValue = "";
  el.classList.add("typing");

  const restore = () => {
    for (const item of items) item.node.nodeValue = item.text;
    el.classList.remove("typing");
  };

  const complete = () => {
    if (state === "done" || state === "cancelled") return;
    state = "done";
    clearTimeout(timer);
    el.classList.remove("typing");
    el.removeAttribute("data-typing");
    onDone?.();
  };

  let index = 0;
  const step = () => {
    if (state !== "typing") return;
    const current = stream[index];
    if (!current) {
      complete();
      return;
    }
    current.node.nodeValue += current.ch;
    index += 1;
    const next = stream[index];
    let delay = charDelay(current.ch, next?.ch ?? "");
    if (next && next.block !== current.block) delay += TYPE_PARAGRAPH_PAUSE_MS;
    timer = setTimeout(step, delay);
  };

  el.dataset.typing = "1";
  timer = setTimeout(step, 120);

  return {
    finish() {
      if (state !== "typing") return;
      clearTimeout(timer);
      restore();
      complete();
    },
    cancel() {
      if (state !== "typing") return;
      clearTimeout(timer);
      state = "cancelled";
      restore();
      el.removeAttribute("data-typing");
    },
    isTyping: () => state === "typing",
  };
}
