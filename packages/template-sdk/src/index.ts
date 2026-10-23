/**
 * Surface publique du sous-chemin `.` (ADR-0024 §4).
 * Point d'entrée sans logique : uniquement des ré-exports.
 */
export { CONTRACT_VERSION, TEMPLATE_HOST_PROTOCOL } from "./constants.js";
export type { DefineTemplateOptions, TemplateRender } from "./define-template.js";
export { defineTemplate } from "./define-template.js";
export type { HChild, HProps } from "./h.js";
export { h } from "./h.js";
export type {
  TemplateManifestInput,
  TemplateManifestOutput,
  TemplateManifestParamInput,
} from "./manifest.js";
export { defineManifest } from "./manifest.js";
export { hasCapability, param } from "./params.js";
export type * from "./types.js";
