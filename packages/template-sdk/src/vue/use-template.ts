/**
 * `useTemplate()` — composable public de l'adaptateur Vue (ADR-0024 §7.2).
 *
 * Toutes les valeurs sont **dérivées** du `shallowRef` fourni par
 * `defineVueTemplate` : la réactivité est celle de Vue (aucun `watch` manuel),
 * et le remplacement du contexte par le host recalcule les `computed`.
 *
 * `actions` est un **objet stable** dont les méthodes délèguent à
 * `store.value.actions` : l'exemple public (`actions.submitIdentity(...)`
 * directement dans `<script setup>`) fonctionne sans `.value`.
 */

import type { ComputedRef, Ref } from "vue";
import { computed, inject, readonly } from "vue";
import type {
  OnirtechContext,
  TemplateActions,
  TemplateCapability,
  TemplateMessage,
  TemplateParamValues,
} from "../types.js";
import { TEMPLATE_CONTEXT_KEY } from "./context.js";

/** Phase de la discussion exposée par le composable. */
export type TemplatePhase = OnirtechContext["state"]["phase"];

/** Valeur retournée par `useTemplate`. */
export type UseTemplateResult = {
  /** Contexte live complet, en lecture seule (`.value` dans le script). */
  ctx: Readonly<Ref<OnirtechContext>>;
  /** Phase courante (déballée automatiquement dans le template). */
  phase: ComputedRef<TemplatePhase>;
  /** Messages de la discussion (tableau remplacé à chaque contexte). */
  messages: ComputedRef<TemplateMessage[]>;
  /** Paramètres résolus du lien (défauts ⊕ lien, ADR-0023). */
  params: ComputedRef<TemplateParamValues>;
  /** Capacités déclarées par le manifeste. */
  capabilities: ComputedRef<readonly TemplateCapability[]>;
  /** Actions stables déléguant au contexte courant. */
  actions: TemplateActions;
};

/** Message d'erreur commun aux usages hors application montée par le SDK. */
const OUTSIDE_APP =
  "[@onirtech/template-sdk/vue] useTemplate() doit être appelé dans un composant " +
  "monté par defineVueTemplate().";

/**
 * Accède au contexte du template (`ctx`, `phase`, `messages`, `params`,
 * `capabilities`, `actions`) avec recalcul automatique à chaque mise à jour.
 */
export function useTemplate(): UseTemplateResult {
  const store = inject(TEMPLATE_CONTEXT_KEY);
  if (store === undefined) throw new Error(OUTSIDE_APP);
  if (typeof store.value.actions.submitIdentity !== "function") {
    throw new Error(
      "[@onirtech/template-sdk/vue] contexte invalide : actions.submitIdentity est absente.",
    );
  }

  // `readonly()` protège le contexte à l'exécution ; le cast aligne le type
  // public sur le contrat ADR (`Readonly<Ref<OnirtechContext>>`) — la variante
  // `DeepReadonly` transformerait les tableaux en `readonly T[]`.
  const ctx = readonly(store) as unknown as Readonly<Ref<OnirtechContext>>;

  const actions: TemplateActions = {
    submitIdentity: (data) => store.value.actions.submitIdentity(data),
    sendMessage: (content, attachmentIds) =>
      store.value.actions.sendMessage(content, attachmentIds),
    attachFile: (fieldName, file) => store.value.actions.attachFile(fieldName, file),
    removeAttachment: (attachmentId) => store.value.actions.removeAttachment(attachmentId),
    finish: () => store.value.actions.finish(),
    request: (capability) => store.value.actions.request(capability),
    openMedia: (url) => store.value.actions.openMedia(url),
    resize: (height) => store.value.actions.resize(height),
  };

  return {
    ctx,
    phase: computed(() => store.value.state.phase),
    messages: computed(() => store.value.state.messages),
    params: computed(() => store.value.params),
    capabilities: computed(() => store.value.capabilities),
    actions,
  };
}
