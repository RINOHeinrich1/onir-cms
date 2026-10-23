/**
 * `defineVueTemplate` — adaptateur Vue du SDK (ADR-0024 §7.1, §10).
 *
 * Le développeur fournit un composant Vue « tel quel » (SFC, `<script setup>`,
 * composants) ; le SDK gère le Custom Element, le shadow root, le CSS inline,
 * le cycle de vie `createApp`/`unmount`, la poussée du contexte à chaque
 * assignation et le repli d'erreur. Aucun `defineCustomElement` de Vue n'est
 * utilisé (build spécifique et styles compliqués, cf. ADR §7.1).
 *
 * Ordre libre (§10.1) : le host connecte l'élément **avant** d'injecter le
 * contexte (`TemplateHost.tsx` l.317-329). L'application est créée dès que
 * l'élément est connecté **et** que le contexte est disponible — au premier
 * `connectedCallback` s'il a été affecté avant, sinon à la première
 * assignation. Le contexte est ensuite poussé dans le `shallowRef` sans
 * démonter l'application (l'état local est conservé).
 */
import type { App, Component, ShallowRef } from "vue";
import { createApp, shallowRef } from "vue";
import { createRenderRoot, injectCss } from "../internal/dom.js";
import type { OnirtechContext, ShadowDomMode } from "../types.js";
import { provideTemplateContext } from "./context.js";

/** Options de `defineVueTemplate`. */
export type DefineVueTemplateOptions = {
  /** CSS injecté **une seule fois** dans le root (chaîne, ex. `?inline`). */
  css?: string;
  /** Mode du Shadow DOM (défaut `open`). */
  shadowDom?: ShadowDomMode;
  /** Rendu de secours si le composant lève. */
  errorFallback?: (error: unknown) => string;
  /** Rapport d'erreur (défaut `console.error`). */
  onError?: (error: unknown) => void;
  /** Nettoyage à la déconnexion (après `app.unmount()`). */
  onUnmount?: () => void;
};

/** Attribut du conteneur monté par Vue à l'intérieur du root. */
const ROOT_ATTRIBUTE = "data-onirtech-root";

/** Attribut du nœud de repli en cas d'erreur de rendu. */
const ERROR_ATTRIBUTE = "data-onirtech-error";

const DEFAULT_FALLBACK_TEXT = "Une erreur est survenue.";

/**
 * Enregistre un template Vue et retourne sa classe.
 * L'enregistrement est idempotent : un second appel retourne la classe
 * existante (rechargement à chaud, double import).
 */
export function defineVueTemplate(
  element: string,
  Component: Component,
  options: DefineVueTemplateOptions = {},
): CustomElementConstructor {
  const existing = customElements.get(element);
  if (existing !== undefined) return existing;

  const mode = options.shadowDom ?? "open";
  const onError =
    options.onError ??
    ((error: unknown): void => {
      console.error("[@onirtech/template-sdk]", error);
    });

  class OnirtechVueTemplateElement extends HTMLElement {
    #root: ShadowRoot | HTMLElement;
    #container: HTMLElement | null = null;
    #errorNode: HTMLElement | null = null;
    #store: ShallowRef<OnirtechContext> | null = null;
    #app: App | null = null;
    #ctx: OnirtechContext | null = null;
    #connected = false;

    constructor() {
      super();
      this.#root = createRenderRoot(this, mode);
    }

    get onirtechContext(): OnirtechContext | null {
      return this.#ctx;
    }

    set onirtechContext(ctx: OnirtechContext | null) {
      // `null` à la déconnexion : on conserve le dernier contexte pour une
      // reconnexion immédiate, comme l'adaptateur React.
      if (ctx === null) {
        this.#ctx = null;
        return;
      }
      this.#ctx = ctx;
      const store = this.#store;
      if (store !== null) {
        // Monté : simple remplacement de la valeur → `computed` recalculés.
        this.#clearError();
        store.value = ctx;
        return;
      }
      // Contexte avant montage : l'app est créée au premier `connectedCallback`.
      if (this.#connected) this.#mount(ctx);
    }

    connectedCallback(): void {
      this.#connected = true;
      injectCss(this.#root, options.css);
      const ctx = this.#ctx;
      // Rendu au montage si le contexte a été affecté avant la connexion.
      if (ctx !== null && this.#app === null) this.#mount(ctx);
    }

    disconnectedCallback(): void {
      this.#connected = false;
      const app = this.#app;
      this.#app = null;
      if (app !== null) {
        try {
          app.unmount();
        } catch (error) {
          onError(error);
        }
      }
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

    #mount(ctx: OnirtechContext): void {
      const container = this.#ensureContainer();
      injectCss(this.#root, options.css);
      this.#clearError();

      let store = this.#store;
      if (store === null) {
        store = shallowRef(ctx);
        this.#store = store;
      } else {
        store.value = ctx;
      }

      const app = createApp(Component);
      // Le contexte est fourni **avant** le montage : le premier `setup()` voit
      // la valeur courante, que le contexte ait été affecté avant ou après.
      provideTemplateContext(app, store);
      app.config.errorHandler = (error) => {
        this.#showError(error);
      };
      // Marqué avant `mount()` : une assignation pendant le montage ne doit pas
      // créer une seconde application.
      this.#app = app;
      try {
        app.mount(container);
      } catch (error) {
        this.#showError(error);
      }
    }

    #showError(error: unknown): void {
      onError(error);
      let node = this.#errorNode;
      if (node === null) {
        node = document.createElement("div");
        node.setAttribute(ERROR_ATTRIBUTE, "");
        this.#errorNode = node;
      }
      const fallback = options.errorFallback;
      node.textContent = fallback === undefined ? DEFAULT_FALLBACK_TEXT : fallback(error);
      if (node.parentNode !== this.#root) this.#root.append(node);
    }

    #clearError(): void {
      const node = this.#errorNode;
      if (node === null) return;
      this.#errorNode = null;
      node.remove();
    }
  }

  customElements.define(element, OnirtechVueTemplateElement);
  return OnirtechVueTemplateElement;
}
