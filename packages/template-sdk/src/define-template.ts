/**
 * `defineTemplate` — squelette Custom Element fourni par le SDK (ADR-0024 §5.1).
 *
 * Le SDK gère : `customElements.define` idempotent, Shadow DOM, getter **et**
 * setter `onirtechContext`, rendu au montage et à chaque réassignation,
 * injection CSS unique, capture d'erreur avec repli, nettoyage (ADR §10.1-10.7).
 */
import { createRenderRoot, injectCss, toNodes } from "./internal/dom.js";
import type { OnirtechContext, ShadowDomMode } from "./types.js";

/** Valeur retournée par une fonction de rendu. */
export type TemplateRender = (
  ctx: OnirtechContext,
) => Node | Node[] | string | number | null | undefined | false;

/** Options de `defineTemplate`. */
export type DefineTemplateOptions = {
  /** CSS injecté une seule fois dans le root. */
  css?: string;
  /** Mode du Shadow DOM (défaut `open`). */
  shadowDom?: ShadowDomMode;
  /** Rendu de secours si `render` lève. */
  errorFallback?: (error: unknown) => Node | string;
  /** Rapport d'erreur (défaut `console.error`). */
  onError?: (error: unknown) => void;
  /** Nettoyage à la déconnexion. */
  onUnmount?: () => void;
};

const DEFAULT_FALLBACK_TEXT = "Une erreur est survenue.";

/**
 * Enregistre un template vanilla et retourne sa classe.
 * L'enregistrement est idempotent : un second appel retourne la classe existante.
 */
export function defineTemplate(
  element: string,
  render: TemplateRender,
  options: DefineTemplateOptions = {},
): CustomElementConstructor {
  const existing = customElements.get(element);
  if (existing !== undefined) return existing;

  const mode = options.shadowDom ?? "open";
  const errorFallback =
    options.errorFallback ?? ((_error: unknown): Node | string => DEFAULT_FALLBACK_TEXT);
  const onError =
    options.onError ??
    ((error: unknown): void => {
      console.error("[@onirtech/template-sdk]", error);
    });

  class OnirtechTemplateElement extends HTMLElement {
    #root: ShadowRoot | HTMLElement;
    #ctx: OnirtechContext | null = null;
    #mounted = false;

    constructor() {
      super();
      this.#root = createRenderRoot(this, mode);
      injectCss(this.#root, options.css);
    }

    get onirtechContext(): OnirtechContext | null {
      return this.#ctx;
    }

    set onirtechContext(ctx: OnirtechContext | null) {
      this.#ctx = ctx;
      if (this.#mounted) this.#render();
    }

    connectedCallback(): void {
      this.#mounted = true;
      this.#render();
    }

    disconnectedCallback(): void {
      this.#mounted = false;
      options.onUnmount?.();
    }

    #render(): void {
      const ctx = this.#ctx;
      if (ctx === null) return;
      try {
        const output = render(ctx);
        this.#root.replaceChildren(...toNodes(output));
      } catch (error) {
        onError(error);
        try {
          this.#root.replaceChildren(...toNodes(errorFallback(error)));
        } catch {
          this.#root.replaceChildren();
        }
      }
      injectCss(this.#root, options.css);
    }
  }

  customElements.define(element, OnirtechTemplateElement);
  return OnirtechTemplateElement;
}
