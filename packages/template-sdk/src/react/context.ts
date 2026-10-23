/**
 * Contexte React interne de l'adaptateur (ADR-0024 §6.2).
 *
 * Le contexte live du host est porté par un `React.Context` : le provider
 * change seulement de `value`, ce qui re-rend les consommateurs **sans**
 * démonter l'arbre (l'état local — `useState` — est conservé).
 */

import type { ReactElement, ReactNode } from "react";
import { createContext, createElement, useContext } from "react";
import type { OnirtechContext } from "../types.js";

/** Contexte React interne : `null` hors d'un template monté par le SDK. */
export const TemplateContext = createContext<OnirtechContext | null>(null);

/** Propriétés du provider interne. */
export type TemplateProviderProps = {
  value: OnirtechContext;
  children?: ReactNode;
};

/**
 * Fournit le contexte live à l'arbre React monté par `defineReactTemplate`.
 * Composant volontairement minimal (`createElement`-only) : sa stabilité
 * d'identité garantit que React réconcilie au lieu de remonter.
 */
export function TemplateProvider(props: TemplateProviderProps): ReactElement {
  return createElement(TemplateContext.Provider, { value: props.value }, props.children);
}

/**
 * Lit le contexte live ; lève une erreur explicite si le hook est utilisé
 * hors d'un composant monté par `defineReactTemplate`.
 */
export function useLiveContext(): OnirtechContext {
  const ctx = useContext(TemplateContext);
  if (ctx === null) {
    throw new Error(
      "[@onirtech/template-sdk/react] useTemplate() doit être appelé dans un composant " +
        "monté par defineReactTemplate().",
    );
  }
  return ctx;
}
