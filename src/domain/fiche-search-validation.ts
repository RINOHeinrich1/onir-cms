/**
 * Validation stricte d'une requête de recherche de fiches (ADR-0067 §4.6).
 * Aucun SQL libre : le modèle fournit un opérateur sémantique, contrôlé contre
 * le type réel du champ déclaré par la fiche de collecte.
 */

import type { TemplateField } from "@/domain/entities/chat-template";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import { isOperatorAllowedForFieldType } from "@/domain/fiche-search-operators";
import {
  DEFAULT_LIMIT,
  type FicheSearchOperator,
  type FicheSearchToolConfig,
  isFicheSearchOperator,
  MAX_CONDITIONS,
  MAX_LIMIT,
  MAX_QUERY_LENGTH,
} from "@/domain/fiche-search-tool";

/** Vue minimale d'une fiche de collecte, sans couplage au snapshot chatbot. */
export type SearchableFicheDefinition = {
  key: string;
  label: string;
  fields: TemplateField[];
  statuses?: FicheStatusDefinition[];
};

export type ValidatedFicheCondition = {
  field: string;
  operator: FicheSearchOperator;
  value?: unknown;
};

export type ValidatedFicheSearchRequest = {
  query: string | null;
  /** Types effectivement interrogeables (ceux qui portent tous les champs filtrés). */
  ficheTypes: string[];
  conditions: ValidatedFicheCondition[];
  createdFrom: string | null;
  createdTo: string | null;
  limit: number;
};

export type FicheSearchValidationResult =
  | { ok: true; value: ValidatedFicheSearchRequest }
  | { ok: false; errors: string[] };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseIsoDay(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!ISO_DAY.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

function parseDayArgument(value: unknown, label: string, errors: string[]): string | null {
  if (value === undefined || value === null || value === "") return null;
  const day = parseIsoDay(value);
  if (day === null) errors.push(`${label} : date ISO AAAA-MM-JJ attendue`);
  return day;
}

type ScalarResult = { ok: true; value: unknown } | { ok: false; error: string };

function normalizeText(value: unknown): ScalarResult {
  if (typeof value !== "string") return { ok: false, error: "valeur texte attendue" };
  const normalized = value.trim();
  if (normalized === "") return { ok: false, error: "valeur texte vide interdite" };
  return { ok: true, value: normalized };
}

function normalizeNumber(value: unknown): ScalarResult {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { ok: false, error: "nombre JSON attendu (pas une chaîne)" };
  }
  return { ok: true, value };
}

function normalizeScalar(field: TemplateField, value: unknown): ScalarResult {
  switch (field.type) {
    case "number":
      return normalizeNumber(value);
    case "date": {
      const day = parseIsoDay(value);
      return day === null
        ? { ok: false, error: "date ISO AAAA-MM-JJ attendue" }
        : { ok: true, value: day };
    }
    case "select": {
      const normalized = normalizeText(value);
      if (!normalized.ok) return normalized;
      const option = normalized.value as string;
      if (!(field.options ?? []).includes(option)) {
        return { ok: false, error: `valeur « ${option} » absente des options du champ` };
      }
      return normalized;
    }
    case "multi": {
      if (!Array.isArray(value) || value.length === 0) {
        return { ok: false, error: "liste de chaînes non vide attendue" };
      }
      const values: string[] = [];
      for (const entry of value) {
        const normalized = normalizeText(entry);
        if (!normalized.ok) return normalized;
        values.push(normalized.value as string);
      }
      return { ok: true, value: [...new Set(values)] };
    }
    case "file":
      return { ok: false, error: "champ fichier non interrogeable" };
    case "image":
      return { ok: false, error: "seuls exists et is_empty sont autorisés sur une image" };
    default:
      return normalizeText(value);
  }
}

function normalizeStringList(value: unknown): ScalarResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "liste de chaînes non vide attendue" };
  }
  const values: string[] = [];
  for (const entry of value) {
    const normalized = normalizeText(entry);
    if (!normalized.ok) return normalized;
    values.push(normalized.value as string);
  }
  return { ok: true, value: [...new Set(values)] };
}

function normalizeList(field: TemplateField, value: unknown): ScalarResult {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, error: "liste de valeurs non vide attendue" };
  }
  const values: unknown[] = [];
  for (const entry of value) {
    const normalized = normalizeScalar(field, entry);
    if (!normalized.ok) return normalized;
    values.push(normalized.value);
  }
  return { ok: true, value: values };
}

function normalizeConditionValue(
  field: TemplateField,
  operator: FicheSearchOperator,
  value: unknown,
): ScalarResult {
  if (operator === "exists" || operator === "is_empty") return { ok: true, value: undefined };
  if (operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      return { ok: false, error: "between exige exactement deux bornes" };
    }
    const low = normalizeScalar(field, value[0]);
    if (!low.ok) return low;
    const high = normalizeScalar(field, value[1]);
    if (!high.ok) return high;
    if (typeof low.value === "number" && typeof high.value === "number" && low.value > high.value) {
      return { ok: false, error: "between : borne inférieure supérieure à la borne supérieure" };
    }
    if (typeof low.value === "string" && typeof high.value === "string" && low.value > high.value) {
      return { ok: false, error: "between : borne inférieure supérieure à la borne supérieure" };
    }
    return { ok: true, value: [low.value, high.value] };
  }
  if (operator === "in" || operator === "not_in") return normalizeList(field, value);
  if (operator === "contains_any" || operator === "contains_all" || operator === "contains_none") {
    if (field.type !== "multi") {
      return { ok: false, error: `opérateur ${operator} réservé aux champs multi` };
    }
    return normalizeStringList(value);
  }
  return normalizeScalar(field, value);
}

function fieldInType(
  definition: SearchableFicheDefinition | undefined,
  fieldName: string,
): TemplateField | null {
  return definition?.fields.find((field) => field.name === fieldName) ?? null;
}

function normalizeFicheTypes(
  value: unknown,
  definitionsByType: Readonly<Record<string, SearchableFicheDefinition>>,
  config: FicheSearchToolConfig,
  errors: string[],
): string[] {
  const available = Object.keys(definitionsByType);
  let requested: string[] | null = null;
  if (value !== undefined && value !== null) {
    if (!Array.isArray(value)) {
      errors.push("ficheTypes : liste attendue");
    } else {
      const types: string[] = [];
      for (const entry of value) {
        if (typeof entry !== "string") {
          errors.push("ficheTypes : clé texte attendue");
          continue;
        }
        const type = entry.trim();
        if (type === "" || types.includes(type)) continue;
        types.push(type);
      }
      if (types.length > 0) requested = types;
    }
  }

  const configTypes = config.ficheTypes;
  for (const type of configTypes) {
    if (!available.includes(type)) {
      errors.push(`Type de fiche configuré introuvable : ${type}`);
    }
  }
  const allowed = configTypes.length > 0 ? configTypes : available;

  if (requested === null) return allowed;
  const effective: string[] = [];
  for (const type of requested) {
    if (!available.includes(type)) {
      errors.push(`Type de fiche inconnu : ${type}`);
      continue;
    }
    if (!allowed.includes(type)) {
      errors.push(`Type de fiche non autorisé par l'outil : ${type}`);
      continue;
    }
    effective.push(type);
  }
  return effective;
}

/** Valide et normalise une requête de recherche. */
export function validateSearchRequest(
  input: unknown,
  definitionsByType: Readonly<Record<string, SearchableFicheDefinition>>,
  config: FicheSearchToolConfig,
): FicheSearchValidationResult {
  const source: Record<string, unknown> = isRecord(input) ? input : {};
  const errors: string[] = [];

  const rawTypes = normalizeFicheTypes(source.ficheTypes, definitionsByType, config, errors);
  if (Object.keys(definitionsByType).length === 0) {
    errors.push("Aucun type de fiche disponible pour ce chatbot");
  }
  if (rawTypes.length === 0) errors.push("Aucun type de fiche interrogeable");

  const rawConditions = source.conditions;
  if (rawConditions !== undefined && !Array.isArray(rawConditions)) {
    errors.push("conditions : liste attendue");
  }
  const conditionList = Array.isArray(rawConditions) ? rawConditions : [];
  if (conditionList.length > MAX_CONDITIONS) {
    errors.push(`${MAX_CONDITIONS} conditions maximum`);
  }

  const conditions: ValidatedFicheCondition[] = [];
  for (const [index, entry] of conditionList.slice(0, MAX_CONDITIONS).entries()) {
    if (!isRecord(entry)) {
      errors.push(`Condition ${index + 1} invalide`);
      continue;
    }
    const fieldName = text(entry.field);
    if (fieldName === "") {
      errors.push(`Condition ${index + 1} : champ obligatoire`);
      continue;
    }
    if (!isFicheSearchOperator(entry.operator)) {
      errors.push(`Condition ${index + 1} : opérateur invalide`);
      continue;
    }
    const operator = entry.operator;
    const matches: Array<{ type: string; field: TemplateField }> = [];
    for (const type of rawTypes) {
      const field = fieldInType(definitionsByType[type], fieldName);
      if (field !== null) matches.push({ type, field });
    }
    if (matches.length === 0) {
      errors.push(`Champ « ${fieldName} » absent de tous les types sélectionnés`);
      continue;
    }
    let compatible = true;
    for (const match of matches) {
      if (!isOperatorAllowedForFieldType(match.field.type, operator)) {
        errors.push(
          `Opérateur ${operator} incompatible avec le champ « ${fieldName} » (${match.field.type})`,
        );
        compatible = false;
      }
    }
    if (!compatible) continue;

    let normalizedValue: unknown;
    let valueOk = true;
    for (const match of matches) {
      const normalized = normalizeConditionValue(match.field, operator, entry.value);
      if (!normalized.ok) {
        errors.push(`Champ « ${fieldName} » : ${normalized.error}`);
        valueOk = false;
        break;
      }
      if (normalizedValue === undefined) normalizedValue = normalized.value;
    }
    if (!valueOk) continue;

    if (operator === "exists" || operator === "is_empty") {
      conditions.push({ field: fieldName, operator });
    } else {
      conditions.push({ field: fieldName, operator, value: normalizedValue });
    }
  }

  // Les fiches d'un type qui ne porte pas l'un des champs filtrés sont exclues.
  const ficheTypes = rawTypes.filter((type) =>
    conditions.every((condition) => fieldInType(definitionsByType[type], condition.field) !== null),
  );
  if (rawTypes.length > 0 && ficheTypes.length === 0 && errors.length === 0) {
    errors.push("Les champs filtrés n'existent dans aucun type de fiche sélectionné");
  }

  if (source.query !== undefined && source.query !== null && typeof source.query !== "string") {
    errors.push("query : texte attendu");
  }
  const query = typeof source.query === "string" ? text(source.query) : "";
  if (query.length > MAX_QUERY_LENGTH) {
    errors.push(`Recherche limitée à ${MAX_QUERY_LENGTH} caractères`);
  }

  const createdFrom = parseDayArgument(source.createdFrom, "createdFrom", errors);
  const createdTo = parseDayArgument(source.createdTo, "createdTo", errors);
  if (createdFrom !== null && createdTo !== null && createdFrom > createdTo) {
    errors.push("createdFrom doit précéder createdTo");
  }

  let limit = DEFAULT_LIMIT;
  if (source.limit !== undefined && source.limit !== null) {
    if (
      typeof source.limit !== "number" ||
      !Number.isInteger(source.limit) ||
      source.limit < 1 ||
      source.limit > MAX_LIMIT
    ) {
      errors.push(`limit : entier entre 1 et ${MAX_LIMIT} attendu`);
    } else {
      limit = source.limit;
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      query: query === "" ? null : query,
      ficheTypes,
      conditions,
      createdFrom,
      createdTo,
      limit,
    },
  };
}
