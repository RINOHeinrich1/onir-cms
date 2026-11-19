/** Clés de templates réservées au catalogue plateforme (ADR-0091 §8 / ADR-0077). */
export const RESERVED_TEMPLATE_KEYS = ["starter"] as const;

/** Limite de templates propriétaires par organisation (ADR-0091 §3). */
export const MAX_OWNER_TEMPLATES = 10;

export function isReservedTemplateKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return RESERVED_TEMPLATE_KEYS.some((reserved) => reserved === normalized);
}
