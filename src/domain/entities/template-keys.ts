/**
 * Portée d'un élément du mini-RAG (connaissance, média) : liste des clés de
 * modèles de raisonnement qui peuvent le voir. Liste vide = portée globale.
 */

/** Nombre maximal de modèles référencés par une portée. */
export const TEMPLATE_KEYS_MAX = 20;

/** Longueur maximale d'une clé de modèle. */
export const TEMPLATE_KEY_MAX_LENGTH = 120;

export type TemplateKeysResult = { ok: true; keys: string[] } | { ok: false; message: string };

/**
 * Normalise une portée brute : accepte un tableau (nouveau format) ou une
 * chaîne (ancien format `templateKey`), supprime les doublons et les vides.
 */
export function normalizeTemplateKeys(value: unknown): TemplateKeysResult {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? [value]
      : value === undefined || value === null
        ? []
        : null;
  if (raw === null) {
    return { ok: false, message: "Portée invalide" };
  }

  const keys: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      return { ok: false, message: "Portée invalide" };
    }
    const key = entry.trim();
    if (key === "" || keys.includes(key)) continue;
    if (key.length > TEMPLATE_KEY_MAX_LENGTH) {
      return {
        ok: false,
        message: `Clé de modèle trop longue (${TEMPLATE_KEY_MAX_LENGTH} caractères maximum)`,
      };
    }
    keys.push(key);
  }
  if (keys.length > TEMPLATE_KEYS_MAX) {
    return { ok: false, message: `Portée trop large (${TEMPLATE_KEYS_MAX} modèles maximum)` };
  }
  return { ok: true, keys };
}

/** Lit la portée d'un objet brut, en tolérant l'ancien champ `templateKey`. */
export function readTemplateKeys(source: Record<string, unknown>): TemplateKeysResult {
  if ("templateKeys" in source) return normalizeTemplateKeys(source.templateKeys);
  return normalizeTemplateKeys(source.templateKey);
}

/** Indique si l'objet brut porte une information de portée (nouvelle ou héritée). */
export function hasTemplateKeys(source: Record<string, unknown>): boolean {
  return "templateKeys" in source || "templateKey" in source;
}
