/**
 * Validation des données d'un livrable contre le schéma déclaratif (B002).
 * Reproduit les règles `fiche-projet` pour le modèle par défaut :
 * champs requis, types, options, et `requiredIf` (ex. contraintes si reprise).
 * Fonctions pures et testables.
 */

import { ATTACHMENT_MAX_FILES } from "@/domain/entities/attachment";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import { canonicalMultiValue, canonicalOption } from "@/domain/field-options";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC_PATTERN = /^-?\d+(?:\.\d+)?$/;

function httpUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? value.trim() : null;
  } catch {
    return null;
  }
}

function isoDate(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_PATTERN.test(value.trim())) return null;
  const text = value.trim();
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : text;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && NUMERIC_PATTERN.test(value.trim())) {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function textList(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const cleaned = entry.trim();
    if (cleaned !== "") seen.add(cleaned);
  }
  return [...seen];
}

function childDefinition(
  definition: TemplateDefinition,
  field: TemplateField,
): TemplateDefinition | undefined {
  return definition.subFiches?.find((entry) => entry.key === field.ficheKey);
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
    case "url":
      return httpUrl(value) === null ? `« ${field.label} » doit être un lien http(s)` : null;
    case "image":
      return httpUrl(value) === null ? `« ${field.label} » doit être une image http(s)` : null;
    case "number":
      return numericValue(value) === null ? `« ${field.label} » doit être un nombre` : null;
    case "date":
      return isoDate(value) === null ? `« ${field.label} » doit être une date YYYY-MM-DD` : null;
    case "select": {
      if (typeof value !== "string" || canonicalOption(field, value) === null) {
        return `« ${field.label} » doit valoir : ${(field.options ?? []).join(", ")}`;
      }
      return null;
    }
    case "multi": {
      const { invalid } = canonicalMultiValue(field, value);
      if (invalid.length > 0) {
        return `« ${field.label} » : valeur inconnue (${invalid.join(", ")})`;
      }
      return null;
    }
    case "file":
      return null;
    case "fiche":
    case "tableau_de_fiches":
      return null;
  }
}

function isEmpty(field: TemplateField, value: unknown): boolean {
  if (field.type === "multi") return textList(value).length === 0;
  if (field.type === "tableau_de_fiches") return !Array.isArray(value) || value.length === 0;
  if (field.type === "number") {
    return (
      value === null || value === undefined || (typeof value === "string" && value.trim() === "")
    );
  }
  return (
    value === null || value === undefined || (typeof value === "string" && value.trim() === "")
  );
}

function normalize(field: TemplateField, value: unknown): unknown {
  if (field.type === "multi") return canonicalMultiValue(field, value).values;
  if (field.type === "number") return numericValue(value);
  if (field.type === "select" && typeof value === "string") {
    return canonicalOption(field, value) ?? value.trim();
  }
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

    if (field.type === "fiche" || field.type === "tableau_de_fiches") {
      const child = childDefinition(definition, field);
      if (child === undefined) {
        errors.push(`Sous-fiche introuvable (${field.name})`);
        continue;
      }
      if (field.type === "fiche") {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          errors.push(`« ${field.label} » doit être un objet`);
          continue;
        }
        const nested = validateTemplateData(child, value);
        if (!nested.ok) {
          errors.push(...nested.errors.map((error) => `${field.label} : ${error}`));
          continue;
        }
        normalized[field.name] = nested.value;
        continue;
      }
      if (!Array.isArray(value)) {
        errors.push(`« ${field.label} » doit être un tableau`);
        continue;
      }
      const rows: Record<string, unknown>[] = [];
      let rowError = false;
      for (const row of value) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) {
          errors.push(`« ${field.label} » contient une ligne invalide`);
          rowError = true;
          continue;
        }
        const nested = validateTemplateData(child, row);
        if (!nested.ok) {
          errors.push(...nested.errors.map((error) => `${field.label} : ${error}`));
          rowError = true;
          continue;
        }
        rows.push(nested.value);
      }
      if (!rowError) normalized[field.name] = rows;
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

    if (field.type === "fiche" || field.type === "tableau_de_fiches") {
      const child = childDefinition(definition, field);
      if (child === undefined) {
        errors.push(`Sous-fiche introuvable (${field.name})`);
        continue;
      }
      if (field.type === "fiche") {
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
          errors.push(`« ${field.label} » doit être un objet`);
          continue;
        }
        const nested = validatePartialTemplateData(child, value);
        if (!nested.ok) {
          errors.push(...nested.errors.map((error) => `${field.label} : ${error}`));
          continue;
        }
        normalized[field.name] = nested.value;
        continue;
      }
      if (!Array.isArray(value)) {
        errors.push(`« ${field.label} » doit être un tableau`);
        continue;
      }
      const rows: Record<string, unknown>[] = [];
      let rowError = false;
      for (const row of value) {
        if (row === null || typeof row !== "object" || Array.isArray(row)) {
          errors.push(`« ${field.label} » contient une ligne invalide`);
          rowError = true;
          continue;
        }
        const nested = validatePartialTemplateData(child, row);
        if (!nested.ok) {
          errors.push(...nested.errors.map((error) => `${field.label} : ${error}`));
          rowError = true;
          continue;
        }
        rows.push(nested.value);
      }
      if (!rowError) normalized[field.name] = rows;
      continue;
    }

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
