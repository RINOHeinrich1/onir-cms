/**
 * `useTemplate()` — hook public de l'adaptateur React (ADR-0024 §6.2).
 *
 * Les valeurs retournées sont **dérivées** du contexte live : aucun état local
 * ni effet. Le re-render est provoqué par le provider à chaque nouvelle
 * assignation de `onirtechContext` (nouveau message, `typing`, phase…).
 */
import type {
  OnirtechContext,
  TemplateActions,
  TemplateCapability,
  TemplateMessage,
  TemplateParamValues,
} from "../types.js";
import { useLiveContext } from "./context.js";

/** Valeur retournée par `useTemplate`. */
export type UseTemplateResult = {
  /** Contexte live complet (payload + actions + abonnement). */
  ctx: OnirtechContext;
  phase: "identity" | "chat";
  messages: TemplateMessage[];
  params: TemplateParamValues;
  capabilities: readonly TemplateCapability[];
  actions: TemplateActions;
};

/**
 * Garde-fou de contrat : un contexte dont les actions n'exposent pas
 * `submitIdentity` n'est pas un contexte hôte valide. On échoue tôt plutôt
 * que de laisser le composant appeler une méthode absente au clic.
 */
function assertActions(actions: TemplateActions): void {
  if (typeof actions.submitIdentity !== "function") {
    throw new Error(
      "[@onirtech/template-sdk/react] contexte invalide : actions.submitIdentity est absente.",
    );
  }
}

/**
 * Accède au contexte du template (`ctx`, `phase`, `messages`, `params`,
 * `capabilities`, `actions`) avec re-render automatique à chaque mise à jour.
 */
export function useTemplate(): UseTemplateResult {
  const ctx = useLiveContext();
  const actions = ctx.actions;
  assertActions(actions);
  return {
    ctx,
    phase: ctx.state.phase,
    messages: ctx.state.messages,
    params: ctx.params,
    capabilities: ctx.capabilities,
    actions,
  };
}
