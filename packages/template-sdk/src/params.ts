/**
 * Lecture robuste du contexte (ADR-0024 §5.3-5.4) : une ligne au lieu des
 * gardes manuelles, y compris quand le harness ne fournit pas `params`.
 */
import type { OnirtechContext, TemplateCapability, TemplateParamValues } from "./types.js";

function isScalar(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

/** Lit un paramètre scalaire dans `ctx.params`, sinon retourne `fallback`. */
export function param<T extends string | number | boolean>(
  ctx: OnirtechContext,
  key: string,
  fallback: T,
): T | string | number | boolean {
  const values = (ctx as { params?: TemplateParamValues }).params;
  const value = values?.[key];
  return isScalar(value) ? value : fallback;
}

/** Indique si le template a déclaré (et reçu) la capacité demandée. */
export function hasCapability(ctx: OnirtechContext, capability: TemplateCapability): boolean {
  const capabilities = (ctx as { capabilities?: readonly string[] }).capabilities;
  return Array.isArray(capabilities) && capabilities.includes(capability);
}
