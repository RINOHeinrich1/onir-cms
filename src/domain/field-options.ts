import type { TemplateField } from "@/domain/entities/chat-template";

/** Clé de comparaison insensible à la casse, aux accents et à la ponctuation. */
export function optionKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Retourne l'option canonique correspondant à la valeur, ou null. */
export function canonicalOption(field: TemplateField, value: string): string | null {
  const options = field.options ?? [];
  const trimmed = value.trim();
  if (options.includes(trimmed)) return trimmed;
  const key = optionKey(trimmed);
  if (key === "") return null;
  return options.find((option) => optionKey(option) === key) ?? null;
}

/**
 * Canonicalise une liste (multi). Les valeurs inconnues sont either mappées
 * vers l'option « Autre » si elle existe, soit retournées comme invalides.
 */
export function canonicalMultiValue(
  field: TemplateField,
  value: unknown,
): { values: string[]; invalid: string[] } {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const values: string[] = [];
  const invalid: string[] = [];
  const autre = (field.options ?? []).find((option) => optionKey(option) === "autre") ?? null;
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const canonical = canonicalOption(field, trimmed);
    if (canonical === null) {
      if (autre !== null) {
        if (!values.includes(autre)) values.push(autre);
      } else {
        invalid.push(trimmed);
      }
      continue;
    }
    if (!values.includes(canonical)) values.push(canonical);
  }
  return { values, invalid };
}

/** Vrai si la valeur respecte une option autorisée (select/multi). */
export function isValidOptionValue(field: TemplateField, value: unknown): boolean {
  if (field.type === "select") {
    return typeof value === "string" && canonicalOption(field, value) !== null;
  }
  if (field.type === "multi") {
    return canonicalMultiValue(field, value).invalid.length === 0;
  }
  return true;
}
