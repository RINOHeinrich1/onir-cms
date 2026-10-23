/**
 * Surface publique du sous-chemin `./vue` (ADR-0024 §4, §7).
 * Point d'entrée sans logique : uniquement des ré-exports.
 */

export type {
  OnirtechContext,
  TemplateActions,
  TemplateCapability,
  TemplateMessage,
  TemplateParamValues,
} from "../types.js";
export type { DefineVueTemplateOptions } from "./define-vue-template.js";
export { defineVueTemplate } from "./define-vue-template.js";
export type { TemplatePhase, UseTemplateResult } from "./use-template.js";
export { useTemplate } from "./use-template.js";
