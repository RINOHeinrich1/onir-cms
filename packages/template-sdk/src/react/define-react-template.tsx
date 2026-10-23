/**
 * `defineReactTemplate` — adaptateur React du SDK (ADR-0024 §6.1, §10).
 *
 * Le développeur fournit un composant React « tel quel » ; le SDK gère le
 * Custom Element, le shadow root, le CSS inline, le cycle de vie
 * `createRoot`/`unmount`, la poussée du contexte à chaque assignation et le
 * repli d'erreur. L'ordre d'assignation est libre (avant ou après
 * `connectedCallback`, cf. `TemplateHost.tsx` l.317-329).
 */

import type { ComponentType, ReactNode } from "react";
import { createElement } from "react";
import type { Root } from "react-dom/client";
import { createRoot } from "react-dom/client";
import { createRenderRoot, injectCss } from "../internal/dom.js";
import type { OnirtechContext, ShadowDomMode } from "../types.js";
import { TemplateProvider } from "./context.js";
import { TemplateErrorBoundary } from "./error-boundary.js";

/** Options de `defineReactTemplate`. */
export type DefineReactTemplateOptions = {
  /** CSS injecté **une seule fois** dans le root (chaîne, ex. `?inline`). */
  css?: string;
  /** Mode du Shadow DOM (défaut `open`). */
  shadowDom?: ShadowDomMode;
  /** Rendu de secours si le composant lève. */
  errorFallback?: (error: unknown) => ReactNode;
  /** Rapport d'erreur (défaut `console.error`). */
  onError?: (error: unknown) => void;
  /** Nettoyage à la déconnexion (après `root.unmount()`). */
  onUnmount?: () => void;
};

/** Attribut du conteneur monté par React à l'intérieur du root. */
const ROOT_ATTRIBUTE = "data-onirtech-root";

/**
 * Enregistre un template React et retourne sa classe.
 * L'enregistrement est idempotent : un second appel retourne la classe
 * existante (rechargement à chaud, double import).
 */
export function defineReactTemplate(
  element: string,
  Component: ComponentType,
  options: DefineReactTemplateOptions = {},
): CustomElementConstructor {
  const existing = customElements.get(element);
  if (existing !== undefined) return existing;

  const mode = options.shadowDom ?? "open";

  class OnirtechReactTemplateElement extends HTMLElement {
    #root: ShadowRoot | HTMLElement;
    #container: HTMLElement | null = null;
    #reactRoot: Root | null = null;
    #ctx: OnirtechContext | null = null;

    constructor() {
      super();
      this.#root = createRenderRoot(this, mode);
    }

    get onirtechContext(): OnirtechContext | null {
      return this.#ctx;
    }

    set onirtechContext(ctx: OnirtechContext | null) {
      this.#ctx = ctx;
      if (ctx === null) return;
      // Monté : on re-render via le provider (jamais de démontage).
      if (this.#reactRoot !== null) this.#render();
    }

    connectedCallback(): void {
      const container = this.#ensureContainer();
      injectCss(this.#root, options.css);
      // Le host peut déplacer le nœud : recréer un root après un démontage.
      if (this.#reactRoot === null) this.#reactRoot = createRoot(container);
      // Rendu au montage si le contexte a été affecté avant la connexion.
      if (this.#ctx !== null) this.#render();
    }

    disconnectedCallback(): void {
      const root = this.#reactRoot;
      this.#reactRoot = null;
      if (root !== null) root.unmount();
      options.onUnmount?.();
    }

    #ensureContainer(): HTMLElement {
      let container = this.#container;
      if (container === null) {
        container = document.createElement("div");
        container.setAttribute(ROOT_ATTRIBUTE, "");
        this.#container = container;
      }
      if (container.parentNode !== this.#root) this.#root.append(container);
      return container;
    }

    #render(): void {
      const root = this.#reactRoot;
      const ctx = this.#ctx;
      if (root === null || ctx === null) return;
      root.render(
        createElement(
          TemplateProvider,
          { value: ctx },
          createElement(
            TemplateErrorBoundary,
            {
              fallback: options.errorFallback,
              onError: options.onError,
            },
            createElement(Component),
          ),
        ),
      );
    }
  }

  customElements.define(element, OnirtechReactTemplateElement);
  return OnirtechReactTemplateElement;
}
