/**
 * Validation des données d'un livrable contre le schéma déclaratif (B002).
 * Reproduit les règles `fiche-projet` pour le modèle par défaut :
 * champs requis, types, options, et `requiredIf` (ex. contraintes si reprise).
 * Fonctions pures et testables.
 */

import { ATTACHMENT_MAX_FILES } from "@/domain/entities/attachment";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const cleaned = entry.trim();
    if (cleaned !== "") seen.add(cleaned);
  }
  return [...seen];
}

function checkType(field: TemplateField, value: unknown): string | null {
  switch (field.type) {
    case "text":
    case "textarea":
      return typeof value === "string" ? null : `« ${field.label} » doit être un texte`;
    case "email": {
      if (typeof value !== "string" || !EMAIL_PATTERN.test(value.trim())) {
        return `« ${field.label} » doit être un email valide`;
      }
      return null;
    }
    case "url": {
      if (typeof value !== "string") return `« ${field.label} » doit être un lien`;
      try {
        const parsed = new URL(value.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          return `« ${field.label} » doit être un lien http(s)`;
        }
      } catch {
        return `« ${field.label} » doit être un lien valide`;
      }
      return null;
    }
    case "select": {
      if (typeof value !== "string" || !(field.options ?? []).includes(value.trim())) {
        return `« ${field.label} » doit valoir : ${(field.options ?? []).join(", ")}`;
      }
      return null;
    }
    case "multi": {
      const items = textList(value);
      for (const item of items) {
        if (!(field.options ?? []).includes(item)) {
          return `« ${field.label} » : valeur inconnue (${item})`;
        }
      }
      return null;
    }
    case "file":
      return null;
  }
}

function isEmpty(field: TemplateField, value: unknown): boolean {
  if (field.type === "multi") return textList(value).length === 0;
  return text(value) === "";
}

function normalize(field: TemplateField, value: unknown): unknown {
  if (field.type === "multi") return textList(value);
  if (typeof value === "string") return value.trim();
  return value;
}

/**
 * Valide `data` (objet brut) contre `definition` et renvoie les valeurs
 * normalisées, ou la liste des erreurs (affichables telles quelles).
 */
export function validateTemplateData(
  definition: TemplateDefinition,
  data: unknown,
  /** Nombre de pièces jointes par champ fichier (ADR-0034). */
  attachmentCounts: Record<string, number> = {},
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const source =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const normalized: Record<string, unknown> = {};

  for (const field of definition.fields) {
    const value = source[field.name];
    const attachmentCount = attachmentCounts[field.name] ?? 0;
    const empty = field.type === "file" ? attachmentCount === 0 : isEmpty(field, value);
    const required =
      field.required ||
      (field.requiredIf !== undefined &&
        text(source[field.requiredIf.field]) === field.requiredIf.equals);

    if (empty) {
      if (required) {
        errors.push(
          field.requiredIf !== undefined && !field.required
            ? `« ${field.label} » est requis dans ce cas`
            : `« ${field.label} » est obligatoire`,
        );
      }
      continue;
    }

    if (field.type === "file") {
      const maxFiles = field.file?.maxFiles ?? ATTACHMENT_MAX_FILES;
      if (attachmentCount > maxFiles) {
        errors.push(`« ${field.label} » : ${maxFiles} fichier(s) maximum`);
      }
      continue;
    }

    const typeError = checkType(field, value);
    if (typeError !== null) {
      errors.push(typeError);
      continue;
    }
    normalized[field.name] = normalize(field, value);
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: normalized };
}

/**
 * Validation d'une mise à jour partielle des champs collectés (ADR-0045).
 * Les champs absents sont ignorés ; un champ fourni mais vide est normalisé
 * comme une valeur vide (chaîne vide ou tableau vide), ce qui permet à un
 * humain d'effacer explicitement une valeur.
 */
export function validatePartialTemplateData(
  definition: TemplateDefinition,
  data: unknown,
): { ok: true; value: Record<string, unknown> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const source =
    data !== null && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  const normalized: Record<string, unknown> = {};

  for (const field of definition.fields) {
    if (!Object.hasOwn(source, field.name)) continue;
    const value = source[field.name];
    if (field.type === "file") continue;

    if (isEmpty(field, value)) {
      normalized[field.name] = field.type === "multi" ? [] : "";
      continue;
    }

    const typeError = checkType(field, value);
    if (typeError !== null) {
      errors.push(typeError);
      continue;
    }
    normalized[field.name] = normalize(field, value);
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: normalized };
}
