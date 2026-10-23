/**
 * Surface publique du sous-chemin `./vite` (ADR-0024 §4, §9).
 * Point d'entrée sans logique : uniquement des ré-exports.
 */

export { defineTemplateConfig } from "./define-template-config.js";
export type { TemplateConfigOptions } from "./options.js";
