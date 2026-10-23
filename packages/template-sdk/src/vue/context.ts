/**
 * Contexte Vue interne de l'adaptateur (ADR-0024 §7.2, §10.1).
 *
 * Le contexte live est porté par un `shallowRef` fourni à l'application Vue :
 * le host **remplace** le contexte à chaque mise à jour (garantie §10.3), la
 * ref change donc de valeur sans être mutée. Une clé d'injection symbolique
 * évite toute variable globale (plusieurs templates montés en parallèle).
 */
import type { App, InjectionKey, ShallowRef } from "vue";
import type { OnirtechContext } from "../types.js";

/** Clé d'injection du contexte live dans l'application Vue montée par le SDK. */
export const TEMPLATE_CONTEXT_KEY: InjectionKey<ShallowRef<OnirtechContext>> = Symbol(
  "onirtech-template-context",
);

/**
 * Fournit le contexte live à l'application Vue. À appeler **avant**
 * `app.mount()` : les `setup()` des composants peuvent ainsi injecter la ref
 * dès le premier rendu.
 */
export function provideTemplateContext(app: App, store: ShallowRef<OnirtechContext>): void {
  app.provide(TEMPLATE_CONTEXT_KEY, store);
}
