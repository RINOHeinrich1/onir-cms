/**
 * Helpers DOM internes (non publics) partagés par les adaptateurs vanilla,
 * React et Vue (ADR-0024 §5.1, §10).
 */
import type { ShadowDomMode } from "../types.js";

/** Marqueur d'injection CSS (attribut `data-onirtech-sdk`). */
const STYLE_KEY = "onirtech-sdk";

const styles = new WeakMap<ShadowRoot | HTMLElement, HTMLStyleElement>();

/**
 * Aplatit récursivement une valeur de rendu en nœuds DOM.
 * `null`, `undefined` et `false` sont ignorés ; chaînes et nombres deviennent
 * des nœuds texte.
 */
export function toNodes(value: unknown): Node[] {
  if (value === null || value === undefined || value === false) return [];
  if (Array.isArray(value)) return value.flatMap((entry) => toNodes(entry));
  if (typeof value === "string") return [document.createTextNode(value)];
  if (typeof value === "number" || typeof value === "bigint") {
    return [document.createTextNode(String(value))];
  }
  if (value instanceof Node) return [value];
  return [];
}

/** Crée le root de rendu : Shadow DOM selon le mode, ou l'élément hôte. */
export function createRenderRoot(el: HTMLElement, mode: ShadowDomMode): ShadowRoot | HTMLElement {
  return mode === "none" ? el : el.attachShadow({ mode });
}

/**
 * Injecte le CSS **une seule fois** dans le root (l'élément `<style>` est créé
 * au premier rendu puis réattaché après chaque remplacement de contenu).
 */
export function injectCss(
  root: ShadowRoot | HTMLElement,
  css: string | undefined,
  key = STYLE_KEY,
): void {
  if (css === undefined || css === "") return;
  let style = styles.get(root);
  if (style === undefined) {
    style = document.createElement("style");
    style.setAttribute(`data-${key}`, "");
    style.textContent = css;
    styles.set(root, style);
  }
  if (style.parentNode !== root) root.prepend(style);
}
