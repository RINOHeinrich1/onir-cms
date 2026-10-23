/**
 * Surface publique du sous-chemin `./react` (ADR-0024 §4, §6).
 * Point d'entrée sans logique : uniquement des ré-exports.
 */

export type {
  OnirtechContext,
  TemplateActions,
  TemplateCapability,
  TemplateMessage,
  TemplateParamValues,
} from "../types.js";
export type { DefineReactTemplateOptions } from "./define-react-template.js";
export { defineReactTemplate } from "./define-react-template.js";
export type { UseTemplateResult } from "./use-template.js";
export { useTemplate } from "./use-template.js";
