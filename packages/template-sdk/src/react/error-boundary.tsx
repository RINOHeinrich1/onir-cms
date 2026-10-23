/**
 * Frontière d'erreur React de l'adaptateur (ADR-0024 §10.5, §6.1).
 *
 * Toute exception levée par le composant du template est capturée,
 * journalisée et remplacée par `options.errorFallback(error)` ou un texte
 * minimal — jamais d'écran blanc.
 */

import type { ReactNode } from "react";
import { Component, createElement } from "react";

/** Propriétés de la frontière d'erreur interne. */
export type TemplateErrorBoundaryProps = {
  /** Rendu de secours ; reçoit l'erreur capturée. */
  fallback?: ((error: unknown) => ReactNode) | undefined;
  /** Rapport d'erreur (défaut `console.error`). */
  onError?: ((error: unknown) => void) | undefined;
  children?: ReactNode;
};

type TemplateErrorBoundaryState = { hasError: boolean; error: unknown };

const DEFAULT_FALLBACK_TEXT = "Une erreur est survenue.";

/** Frontière d'erreur `createElement`-only (aucun import `react/jsx-runtime`). */
export class TemplateErrorBoundary extends Component<
  TemplateErrorBoundaryProps,
  TemplateErrorBoundaryState
> {
  state: TemplateErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: unknown): TemplateErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: unknown): void {
    const onError =
      this.props.onError ??
      ((caught: unknown): void => {
        console.error("[@onirtech/template-sdk]", caught);
      });
    onError(error);
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children ?? null;
    const fallback = this.props.fallback;
    return createElement(
      "div",
      { "data-onirtech-error": "" },
      fallback !== undefined ? fallback(this.state.error) : DEFAULT_FALLBACK_TEXT,
    );
  }
}
