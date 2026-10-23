/**
 * Surface publique du sous-chemin `./testing` (ADR-0024 §4, §8).
 * Point d'entrée sans logique : uniquement des ré-exports.
 */

export type { DeepPartial } from "./create-mock-context.js";
export { createMockContext } from "./create-mock-context.js";
export { mountTemplate } from "./mount-template.js";
