/**
 * `mountTemplate` — montage du **vrai** Custom Element dans le DOM de test
 * (ADR-0024 §8.2, §10.6).
 *
 * Le helper **n'enregistre jamais** l'élément : c'est le template testé qui
 * l'enregistre (import de son entrée). Un oubli produit une erreur explicite.
 */
import type { OnirtechContext } from "../types.js";

/** Élément Custom Element exposant le contexte du SDK. */
type TemplateElement = HTMLElement & { onirtechContext: OnirtechContext | null };

function notRegistered(element: string): string {
  return (
    `[template-sdk/testing] élément "<${element}>" non enregistré : ` +
    `importez le module du template (ex. import "../src/index.js") avant d'appeler mountTemplate().`
  );
}

/**
 * Monte `element` dans `document.body` avec `ctx`, puis retourne les opérations
 * de cycle de vie : `update(ctx)` (nouvelle assignation → nouveau rendu) et
 * `unmount()` (retrait du DOM + libération du contexte).
 */
export function mountTemplate(
  element: string,
  ctx: OnirtechContext,
): { el: HTMLElement; update(ctx: OnirtechContext): void; unmount(): void } {
  if (customElements.get(element) === undefined) {
    throw new Error(notRegistered(element));
  }
  const el = document.createElement(element) as TemplateElement;
  document.body.append(el);
  el.onirtechContext = ctx;
  return {
    el,
    update(next: OnirtechContext): void {
      el.onirtechContext = next;
    },
    unmount(): void {
      el.remove();
      el.onirtechContext = null;
    },
  };
}
