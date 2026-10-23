/**
 * `h` — création de DOM natif sans framework (ADR-0024 §5.2).
 *
 * Garantie : aucune valeur n'est interprétée comme du HTML. `text` alimente
 * `textContent` et les enfants textuels deviennent des nœuds texte (ADR §10.4).
 */
import { toNodes } from "./internal/dom.js";

/** Propriétés acceptées par `h` : `class`, `text`, écouteurs `on*`, attributs. */
export type HProps = {
  class?: string;
  text?: string;
  [key: string]: string | number | boolean | ((event: Event) => void) | null | undefined;
};

/** Enfant accepté par `h` (aplati récursivement, `null`/`false` ignorés). */
export type HChild = Node | string | number | null | undefined | false | readonly HChild[];

/**
 * Crée un élément DOM.
 *
 * - `class` → `className` ;
 * - `text` → `textContent` (jamais de HTML) ;
 * - `on*` → `addEventListener` (ex. `onclick`) ;
 * - autres clés → `setAttribute` (`null`/`undefined` ignorés).
 */
export function h(tag: string, props: HProps | null = null, ...children: HChild[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined) continue;
    if (key === "class") {
      node.className = String(value);
    } else if (key === "text") {
      node.textContent = String(value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else {
      node.setAttribute(key, String(value));
    }
  }
  node.append(...toNodes(children));
  return node;
}
