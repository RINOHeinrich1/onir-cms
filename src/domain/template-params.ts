/**
 * Variables paramétrables des templates visuels (ADR-0023 / ADR-0095).
 *
 * Contrat générique : le cœur ne connaît aucun paramètre nommé. Il manipule un
 * schéma JSON récursif, un sac de valeurs stocké sur le lien et une résolution
 * par type. La sémantique métier reste entièrement dans le template.
 */

export const TEMPLATE_PARAM_TYPES = [
  "string",
  "text",
  "number",
  "boolean",
  "color",
  "url",
  "image",
  "select",
  "object",
  "array",
] as const;

export type TemplateParamType = (typeof TEMPLATE_PARAM_TYPES)[number];

export type TemplateParamOption = { value: string; label: string };

export type TemplateParamScalar = string | number | boolean;
export type TemplateParamValue =
  | TemplateParamScalar
  | TemplateParamValue[]
  | { [key: string]: TemplateParamValue };
export type TemplateParamValues = Record<string, TemplateParamValue>;

export type TemplateParamNode = {
  type: TemplateParamType;
  /** Toujours présent : aucun nœud sans défaut (ADR-0023). */
  default: TemplateParamValue;
  /** `string` / `text` uniquement (défaut 200). */
  maxLength?: number;
  /** `number` uniquement. */
  min?: number;
  max?: number;
  /** `select` uniquement. */
  options?: TemplateParamOption[];
  /** `object` uniquement : propriétés déclarées, aucune clé arbitraire. */
  properties?: TemplateParamSchema[];
  /** `array` uniquement. */
  items?: TemplateParamNode;
  minItems?: number;
  maxItems?: number;
};

export type TemplateParamSchema = TemplateParamNode & {
  key: string;
  label: string;
  description: string;
};

export type TemplateParamError = { field: string; message: string };

export const MAX_TEMPLATE_PARAMS = 64;
export const MAX_TEMPLATE_PARAMS_JSON_BYTES = 64 * 1024;
export const MAX_TEMPLATE_PARAM_STRING = 2000;
export const DEFAULT_TEMPLATE_PARAM_MAX_LENGTH = 200;
export const MAX_TEMPLATE_PARAM_OPTIONS = 40;
export const MAX_TEMPLATE_PARAM_DEPTH = 8;
export const MAX_TEMPLATE_PARAM_NODES = 300;
export const MAX_TEMPLATE_PARAM_PROPERTIES = 50;
export const MAX_TEMPLATE_PARAM_ITEMS = 100;

const KEY = /^[a-z][a-z0-9_]{1,40}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isScalar(value: unknown): value is TemplateParamScalar {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Longueur en octets UTF-8 (le domaine n'importe rien de Node). */
function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function cloneValue(value: TemplateParamValue): TemplateParamValue {
  return JSON.parse(JSON.stringify(value)) as TemplateParamValue;
}

function scalarValid(type: TemplateParamType, param: TemplateParamNode, value: unknown): boolean {
  switch (type) {
    case "string":
    case "text":
      return (
        typeof value === "string" &&
        value.length <= (param.maxLength ?? DEFAULT_TEMPLATE_PARAM_MAX_LENGTH)
      );
    case "number":
      return (
        typeof value === "number" &&
        Number.isFinite(value) &&
        (param.min === undefined || value >= param.min) &&
        (param.max === undefined || value <= param.max)
      );
    case "boolean":
      return typeof value === "boolean";
    case "color":
      return typeof value === "string" && COLOR.test(value);
    case "url":
      return typeof value === "string" && isHttpUrl(value);
    case "image":
      return typeof value === "string" && (value === "" || isHttpUrl(value));
    case "select":
      return (
        typeof value === "string" && (param.options ?? []).some((option) => option.value === value)
      );
    default:
      return false;
  }
}

function validateNodeValue(
  param: TemplateParamNode,
  value: unknown,
  path: string,
  errors: TemplateParamError[],
): value is TemplateParamValue {
  if (param.type === "object") {
    if (!isRecord(value)) {
      errors.push({ field: path, message: "objet attendu" });
      return false;
    }
    const properties = param.properties ?? [];
    const known = new Set(properties.map((property) => property.key));
    for (const key of Object.keys(value)) {
      if (!known.has(key)) errors.push({ field: `${path}.${key}`, message: "clé non déclarée" });
    }
    let ok = true;
    for (const property of properties) {
      const child = value[property.key];
      if (child === undefined) continue;
      if (!validateNodeValue(property, child, `${path}.${property.key}`, errors)) ok = false;
    }
    return ok;
  }
  if (param.type === "array") {
    if (!Array.isArray(value)) {
      errors.push({ field: path, message: "tableau attendu" });
      return false;
    }
    const min = param.minItems ?? 0;
    const max = param.maxItems ?? MAX_TEMPLATE_PARAM_ITEMS;
    if (value.length < min || value.length > max) {
      errors.push({ field: path, message: `nombre d'éléments attendu : ${min}..${max}` });
    }
    if (param.items === undefined) {
      errors.push({ field: path, message: "items requis pour un tableau" });
      return false;
    }
    let ok = value.length >= min && value.length <= max;
    value.forEach((entry, index) => {
      if (
        !validateNodeValue(param.items as TemplateParamNode, entry, `${path}[${index}]`, errors)
      ) {
        ok = false;
      }
    });
    return ok;
  }
  if (!scalarValid(param.type, param, value)) {
    errors.push({ field: path, message: "valeur invalide" });
    return false;
  }
  return true;
}

function normalizeNodeValue(
  param: TemplateParamNode,
  value: unknown,
  depth: number,
): TemplateParamValue | undefined {
  if (depth > MAX_TEMPLATE_PARAM_DEPTH) return undefined;
  if (param.type === "object") {
    if (!isRecord(value)) return undefined;
    const properties = param.properties ?? [];
    const known = new Set(properties.map((property) => property.key));
    if (Object.keys(value).some((key) => !known.has(key))) return undefined;
    const out: Record<string, TemplateParamValue> = {};
    for (const property of properties) {
      const child = value[property.key];
      const normalized =
        child === undefined
          ? cloneValue(property.default)
          : normalizeNodeValue(property, child, depth + 1);
      if (normalized === undefined) return undefined;
      out[property.key] = normalized;
    }
    return out;
  }
  if (param.type === "array") {
    if (!Array.isArray(value) || param.items === undefined) return undefined;
    const min = param.minItems ?? 0;
    const max = param.maxItems ?? MAX_TEMPLATE_PARAM_ITEMS;
    if (value.length < min || value.length > max) return undefined;
    const out: TemplateParamValue[] = [];
    for (const entry of value) {
      const normalized = normalizeNodeValue(param.items, entry, depth + 1);
      if (normalized === undefined) return undefined;
      out.push(normalized);
    }
    return out;
  }
  if (!scalarValid(param.type, param, value)) return undefined;
  return value as TemplateParamScalar;
}

function normalizeJsonValue(
  value: unknown,
  depth: number,
  counter: { nodes: number },
): TemplateParamValue | undefined {
  if (depth > MAX_TEMPLATE_PARAM_DEPTH) return undefined;
  counter.nodes += 1;
  if (counter.nodes > MAX_TEMPLATE_PARAM_NODES) return undefined;
  if (isScalar(value)) {
    if (typeof value === "string" && value.length > MAX_TEMPLATE_PARAM_STRING) return undefined;
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_TEMPLATE_PARAM_ITEMS) return undefined;
    const out: TemplateParamValue[] = [];
    for (const entry of value) {
      const normalized = normalizeJsonValue(entry, depth + 1, counter);
      if (normalized === undefined) return undefined;
      out.push(normalized);
    }
    return out;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > MAX_TEMPLATE_PARAM_PROPERTIES) return undefined;
    const out: Record<string, TemplateParamValue> = {};
    for (const [key, entry] of entries) {
      if (key === "" || key.length > 64 || FORBIDDEN_KEYS.has(key)) return undefined;
      const normalized = normalizeJsonValue(entry, depth + 1, counter);
      if (normalized === undefined) return undefined;
      out[key] = normalized;
    }
    return out;
  }
  return undefined;
}

function nodeValueOrError(
  param: TemplateParamNode,
  raw: unknown,
  base: string,
  errors: TemplateParamError[],
): TemplateParamValue | undefined {
  const normalized = normalizeNodeValue(param, raw, 0);
  if (normalized === undefined)
    errors.push({ field: `${base}.default`, message: "défaut invalide" });
  return normalized;
}

function parseScalarNode(
  src: Record<string, unknown>,
  base: string,
  type: TemplateParamType,
  errors: TemplateParamError[],
): TemplateParamNode | null {
  const value = src.default;
  const param: TemplateParamNode = {
    type,
    default: "" as TemplateParamValue,
  };
  switch (type) {
    case "string":
    case "text": {
      const maxLength =
        src.maxLength === undefined
          ? DEFAULT_TEMPLATE_PARAM_MAX_LENGTH
          : typeof src.maxLength === "number" && Number.isInteger(src.maxLength)
            ? src.maxLength
            : Number.NaN;
      if (!Number.isFinite(maxLength) || maxLength < 1 || maxLength > MAX_TEMPLATE_PARAM_STRING) {
        errors.push({
          field: `${base}.maxLength`,
          message: `maxLength entier dans 1..${MAX_TEMPLATE_PARAM_STRING}`,
        });
      }
      if (typeof value !== "string") {
        errors.push({ field: `${base}.default`, message: "défaut attendu : chaîne" });
      } else if (Number.isFinite(maxLength) && value.length > maxLength) {
        errors.push({
          field: `${base}.default`,
          message: `défaut plus long que maxLength (${maxLength})`,
        });
      } else {
        param.default = value;
        if (Number.isFinite(maxLength)) param.maxLength = maxLength;
      }
      break;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        errors.push({ field: `${base}.default`, message: "défaut attendu : nombre fini" });
        break;
      }
      const min = src.min === undefined ? undefined : src.min;
      const max = src.max === undefined ? undefined : src.max;
      if (min !== undefined && (typeof min !== "number" || !Number.isFinite(min))) {
        errors.push({ field: `${base}.min`, message: "min doit être un nombre fini" });
      }
      if (max !== undefined && (typeof max !== "number" || !Number.isFinite(max))) {
        errors.push({ field: `${base}.max`, message: "max doit être un nombre fini" });
      }
      if (typeof min === "number" && typeof max === "number" && min > max) {
        errors.push({ field: `${base}.min`, message: "min doit être ≤ max" });
      }
      if (typeof min === "number" && value < min) {
        errors.push({ field: `${base}.default`, message: "défaut inférieur à min" });
      }
      if (typeof max === "number" && value > max) {
        errors.push({ field: `${base}.default`, message: "défaut supérieur à max" });
      }
      param.default = value;
      if (typeof min === "number") param.min = min;
      if (typeof max === "number") param.max = max;
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") {
        errors.push({ field: `${base}.default`, message: "défaut attendu : booléen" });
        break;
      }
      param.default = value;
      break;
    }
    case "color": {
      if (typeof value !== "string" || !COLOR.test(value)) {
        errors.push({ field: `${base}.default`, message: "défaut attendu : #rrggbb" });
        break;
      }
      param.default = value;
      break;
    }
    case "url": {
      if (typeof value !== "string" || !isHttpUrl(value)) {
        errors.push({ field: `${base}.default`, message: "défaut attendu : URL http(s)" });
        break;
      }
      param.default = value;
      break;
    }
    case "image": {
      if (typeof value !== "string" || (value !== "" && !isHttpUrl(value))) {
        errors.push({ field: `${base}.default`, message: "défaut attendu : vide ou URL http(s)" });
        break;
      }
      param.default = value;
      break;
    }
    case "select": {
      if (!Array.isArray(src.options) || src.options.length === 0) {
        errors.push({ field: `${base}.options`, message: "select exige au moins une option" });
        break;
      }
      if (src.options.length > MAX_TEMPLATE_PARAM_OPTIONS) {
        errors.push({
          field: `${base}.options`,
          message: `au plus ${MAX_TEMPLATE_PARAM_OPTIONS} options`,
        });
        break;
      }
      const options: TemplateParamOption[] = [];
      const values = new Set<string>();
      src.options.forEach((option, optionIndex) => {
        const opt = record(option);
        const optionValue = text(opt.value);
        const optionLabel = text(opt.label);
        if (optionValue === "" || values.has(optionValue)) {
          errors.push({
            field: `${base}.options[${optionIndex}].value`,
            message: "valeur requise et unique",
          });
          return;
        }
        values.add(optionValue);
        options.push({
          value: optionValue,
          label: optionLabel === "" ? optionValue : optionLabel,
        });
      });
      if (typeof value !== "string" || !values.has(value)) {
        errors.push({
          field: `${base}.default`,
          message: "défaut attendu : l'une des valeurs d'options",
        });
        break;
      }
      param.default = value;
      param.options = options;
      break;
    }
    default:
      return null;
  }
  return param;
}

function parseItemNode(
  raw: unknown,
  base: string,
  depth: number,
  counter: { nodes: number },
  errors: TemplateParamError[],
): TemplateParamNode | null {
  if (depth > MAX_TEMPLATE_PARAM_DEPTH) {
    errors.push({ field: base, message: `profondeur > ${MAX_TEMPLATE_PARAM_DEPTH}` });
    return null;
  }
  counter.nodes += 1;
  if (counter.nodes > MAX_TEMPLATE_PARAM_NODES) {
    errors.push({ field: base, message: `plus de ${MAX_TEMPLATE_PARAM_NODES} nœuds` });
    return null;
  }
  if (!isRecord(raw)) {
    errors.push({ field: base, message: "objet attendu" });
    return null;
  }
  const type = text(raw.type);
  if (!(TEMPLATE_PARAM_TYPES as readonly string[]).includes(type)) {
    errors.push({ field: `${base}.type`, message: `type ∈ ${TEMPLATE_PARAM_TYPES.join(", ")}` });
    return null;
  }
  if (!("default" in raw)) {
    errors.push({ field: `${base}.default`, message: "valeur par défaut obligatoire" });
    return null;
  }
  return parseNode(raw, base, type as TemplateParamType, depth, counter, errors);
}

function parseNode(
  src: Record<string, unknown>,
  base: string,
  type: TemplateParamType,
  depth: number,
  counter: { nodes: number },
  errors: TemplateParamError[],
): TemplateParamNode | null {
  if (depth > MAX_TEMPLATE_PARAM_DEPTH) {
    errors.push({ field: base, message: `profondeur > ${MAX_TEMPLATE_PARAM_DEPTH}` });
    return null;
  }
  counter.nodes += 1;
  if (counter.nodes > MAX_TEMPLATE_PARAM_NODES) {
    errors.push({ field: base, message: `plus de ${MAX_TEMPLATE_PARAM_NODES} nœuds` });
    return null;
  }
  if (type === "object") {
    const propertiesRaw = src.properties;
    if (propertiesRaw !== undefined && !Array.isArray(propertiesRaw)) {
      errors.push({ field: `${base}.properties`, message: "properties doit être une liste" });
      return null;
    }
    const properties = parseSchemaList(
      propertiesRaw ?? [],
      `${base}.properties`,
      depth + 1,
      counter,
      errors,
      true,
      MAX_TEMPLATE_PARAM_PROPERTIES,
    );
    const param: TemplateParamNode = {
      type,
      default: {},
      properties,
    };
    const normalized = nodeValueOrError(param, src.default, base, errors);
    if (normalized !== undefined) param.default = normalized;
    return param;
  }
  if (type === "array") {
    if (src.items === undefined) {
      errors.push({ field: `${base}.items`, message: "items requis pour un tableau" });
      return null;
    }
    const items = parseItemNode(src.items, `${base}.items`, depth + 1, counter, errors);
    const minItems =
      src.minItems === undefined
        ? 0
        : typeof src.minItems === "number" && Number.isInteger(src.minItems)
          ? src.minItems
          : Number.NaN;
    const maxItems =
      src.maxItems === undefined
        ? MAX_TEMPLATE_PARAM_ITEMS
        : typeof src.maxItems === "number" && Number.isInteger(src.maxItems)
          ? src.maxItems
          : Number.NaN;
    if (!Number.isFinite(minItems) || minItems < 0 || minItems > MAX_TEMPLATE_PARAM_ITEMS) {
      errors.push({
        field: `${base}.minItems`,
        message: `minItems entier dans 0..${MAX_TEMPLATE_PARAM_ITEMS}`,
      });
    }
    if (!Number.isFinite(maxItems) || maxItems < 0 || maxItems > MAX_TEMPLATE_PARAM_ITEMS) {
      errors.push({
        field: `${base}.maxItems`,
        message: `maxItems entier dans 0..${MAX_TEMPLATE_PARAM_ITEMS}`,
      });
    }
    if (Number.isFinite(minItems) && Number.isFinite(maxItems) && minItems > maxItems) {
      errors.push({ field: `${base}.minItems`, message: "minItems doit être ≤ maxItems" });
    }
    const param: TemplateParamNode = {
      type,
      default: [],
      ...(items === null ? {} : { items }),
    };
    if (Number.isFinite(minItems)) param.minItems = minItems;
    if (Number.isFinite(maxItems)) param.maxItems = maxItems;
    if (items !== null) {
      const normalized = nodeValueOrError(param, src.default, base, errors);
      if (normalized !== undefined) param.default = normalized;
    }
    return param;
  }
  return parseScalarNode(src, base, type, errors);
}

function parseSchemaEntry(
  entry: unknown,
  base: string,
  depth: number,
  counter: { nodes: number },
  errors: TemplateParamError[],
  requireKey: boolean,
): TemplateParamSchema | null {
  if (!isRecord(entry)) {
    errors.push({ field: base, message: "un paramètre doit être un objet" });
    return null;
  }
  const key = text(entry.key);
  if (requireKey && !KEY.test(key)) {
    errors.push({
      field: `${base}.key`,
      message: "clé en minuscules, chiffres et _ (^[a-z][a-z0-9_]{1,40}$)",
    });
  }
  const label = text(entry.label);
  if (label === "" || label.length > 80) {
    errors.push({ field: `${base}.label`, message: "libellé requis (1..80 caractères)" });
  }
  const description = text(entry.description);
  if (description.length > 200) {
    errors.push({ field: `${base}.description`, message: "description limitée à 200 caractères" });
  }
  const type = text(entry.type);
  if (!(TEMPLATE_PARAM_TYPES as readonly string[]).includes(type)) {
    errors.push({ field: `${base}.type`, message: `type ∈ ${TEMPLATE_PARAM_TYPES.join(", ")}` });
    return null;
  }
  if (!("default" in entry)) {
    errors.push({ field: `${base}.default`, message: "valeur par défaut obligatoire" });
    return null;
  }
  const node = parseNode(entry, base, type as TemplateParamType, depth, counter, errors);
  if (node === null) return null;
  return {
    ...node,
    key: key === "" ? `param_${base}` : key,
    label: label === "" ? key : label,
    description,
  };
}

function parseSchemaList(
  input: unknown[],
  base: string,
  depth: number,
  counter: { nodes: number },
  errors: TemplateParamError[],
  requireKey: boolean,
  max: number,
): TemplateParamSchema[] {
  if (!Array.isArray(input)) {
    errors.push({ field: base, message: "liste attendue" });
    return [];
  }
  if (input.length > max) {
    errors.push({ field: base, message: `au plus ${max} éléments` });
  }
  const seen = new Set<string>();
  const out: TemplateParamSchema[] = [];
  input.forEach((entry, index) => {
    const parsed = parseSchemaEntry(entry, `${base}[${index}]`, depth, counter, errors, requireKey);
    if (parsed === null) return;
    if (requireKey) {
      if (seen.has(parsed.key))
        errors.push({ field: `${base}[${index}].key`, message: "clé dupliquée" });
      seen.add(parsed.key);
    }
    out.push(parsed);
  });
  return out;
}

/**
 * Valide le bloc `params` d'un manifeste. `undefined` est valide (aucun
 * paramètre). Les champs inconnus d'un paramètre sont ignorés (projection).
 */
export function validateTemplateParamSchema(
  input: unknown,
): { ok: true; value: TemplateParamSchema[] } | { ok: false; errors: TemplateParamError[] } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "params", message: "params doit être une liste" }] };
  }
  let serialized = "";
  try {
    serialized = JSON.stringify(input);
  } catch {
    return { ok: false, errors: [{ field: "params", message: "params non sérialisable" }] };
  }
  if (byteLength(serialized) > MAX_TEMPLATE_PARAMS_JSON_BYTES) {
    return {
      ok: false,
      errors: [
        {
          field: "params",
          message: `params dépasse ${MAX_TEMPLATE_PARAMS_JSON_BYTES} octets`,
        },
      ],
    };
  }
  const errors: TemplateParamError[] = [];
  const counter = { nodes: 0 };
  const out = parseSchemaList(input, "params", 0, counter, errors, true, MAX_TEMPLATE_PARAMS);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

/**
 * Normalise un sac de valeurs stocké : scalaires et structures JSON bornées.
 * Les clés inconnues du schéma sont conservées (valeurs « plus utilisées »).
 */
export function normalizeTemplateParamValues(input: unknown): TemplateParamValues {
  const src = record(input);
  const out: TemplateParamValues = {};
  const counter = { nodes: 0 };
  for (const [key, value] of Object.entries(src)) {
    if (key === "" || key.length > 64 || FORBIDDEN_KEYS.has(key)) continue;
    const normalized = normalizeJsonValue(value, 0, counter);
    if (normalized !== undefined) out[key] = normalized;
  }
  const keys = Object.keys(out);
  let index = keys.length - 1;
  while (index >= 0 && byteLength(JSON.stringify(out)) > MAX_TEMPLATE_PARAMS_JSON_BYTES) {
    const key = keys[index];
    if (key !== undefined) delete out[key];
    index -= 1;
  }
  return out;
}

export type TemplateParamMergeResult = {
  values: TemplateParamValues;
  preserved: string[];
  reset: string[];
  added: string[];
  removed: string[];
};

function mergeNodeValue(
  oldParam: TemplateParamNode,
  newParam: TemplateParamNode,
  oldValue: unknown,
): TemplateParamValue {
  if (oldParam.type !== newParam.type) return cloneValue(newParam.default);
  if (newParam.type === "object") {
    if (!isRecord(oldValue)) return cloneValue(newParam.default);
    const oldByKey = new Map(
      (oldParam.properties ?? []).map((property) => [property.key, property]),
    );
    const out: Record<string, TemplateParamValue> = {};
    for (const property of newParam.properties ?? []) {
      const previous = oldByKey.get(property.key);
      out[property.key] =
        previous === undefined
          ? cloneValue(property.default)
          : mergeNodeValue(previous, property, oldValue[property.key]);
    }
    return out;
  }
  if (newParam.type === "array") {
    const newItems = newParam.items;
    if (!Array.isArray(oldValue) || newItems === undefined) return cloneValue(newParam.default);
    const oldItems = oldParam.items;
    if (oldItems === undefined || oldItems.type !== newItems.type) {
      return cloneValue(newParam.default);
    }
    const merged = oldValue
      .map((entry) => mergeNodeValue(oldItems, newItems, entry))
      .slice(0, newParam.maxItems ?? MAX_TEMPLATE_PARAM_ITEMS);
    if (merged.length < (newParam.minItems ?? 0)) return cloneValue(newParam.default);
    return merged;
  }
  if (oldParam.type === newParam.type && isValidParamValue(newParam, oldValue)) {
    return oldValue as TemplateParamValue;
  }
  return cloneValue(newParam.default);
}

/**
 * Fusionne des valeurs de template lors d'un changement de schéma/version.
 * Une valeur n'est conservée que si la clé existe encore avec un type
 * compatible et reste valide dans le nouveau schéma.
 */
export function mergeTemplateParams(
  oldSchema: TemplateParamSchema[],
  newSchema: TemplateParamSchema[],
  oldValues: TemplateParamValues,
): TemplateParamMergeResult {
  const oldByKey = new Map(oldSchema.map((param) => [param.key, param]));
  const newKeys = new Set(newSchema.map((param) => param.key));
  const values: TemplateParamValues = {};
  const preserved: string[] = [];
  const reset: string[] = [];
  const added: string[] = [];
  for (const param of newSchema) {
    const old = oldByKey.get(param.key);
    if (old === undefined) {
      values[param.key] = cloneValue(param.default);
      added.push(param.key);
      continue;
    }
    const oldValue = oldValues[param.key];
    if (old.type === param.type && oldValue !== undefined && isValidParamValue(param, oldValue)) {
      values[param.key] = mergeNodeValue(old, param, oldValue);
      preserved.push(param.key);
    } else {
      values[param.key] = cloneValue(param.default);
      reset.push(param.key);
    }
  }
  const removed = oldSchema.map((param) => param.key).filter((key) => !newKeys.has(key));
  return { values, preserved, reset, added, removed };
}

/** Un défaut de schéma est toujours une valeur valide (garanti à l'import). */
export function isValidParamValue(
  param: TemplateParamNode,
  value: unknown,
): value is TemplateParamValue {
  const errors: TemplateParamError[] = [];
  return validateNodeValue(param, value, "value", errors);
}

/**
 * Validation **stricte** des valeurs connues du schéma (enregistrement du lien).
 * Les clés inconnues de premier niveau ne sont pas des erreurs.
 */
export function validateTemplateParamValues(
  schema: TemplateParamSchema[],
  values: TemplateParamValues,
): TemplateParamError[] {
  const errors: TemplateParamError[] = [];
  for (const param of schema) {
    if (!(param.key in values)) continue;
    const value = values[param.key];
    if (value === undefined) continue;
    validateNodeValue(param, value, param.key, errors);
  }
  return errors;
}

function resolveNodeValue(param: TemplateParamNode, value: unknown): TemplateParamValue {
  if (param.type === "object") {
    const src = isRecord(value) ? value : {};
    const out: Record<string, TemplateParamValue> = {};
    for (const property of param.properties ?? []) {
      out[property.key] = resolveNodeValue(property, src[property.key]);
    }
    return out;
  }
  if (param.type === "array") {
    if (!Array.isArray(value) || param.items === undefined) return cloneValue(param.default);
    const min = param.minItems ?? 0;
    const max = param.maxItems ?? MAX_TEMPLATE_PARAM_ITEMS;
    if (value.length < min || value.length > max) return cloneValue(param.default);
    return value.map((entry) => resolveNodeValue(param.items as TemplateParamNode, entry));
  }
  return isValidParamValue(param, value)
    ? (value as TemplateParamValue)
    : cloneValue(param.default);
}

/**
 * Résolution **tolérante** (chargement public) : défauts ← valeurs, une valeur
 * invalide retombe sur le défaut au niveau du nœud concerné.
 */
export function resolveTemplateParams(
  schema: TemplateParamSchema[] | null | undefined,
  values: unknown,
): TemplateParamValues {
  const src = record(values);
  const out: TemplateParamValues = {};
  for (const param of Array.isArray(schema) ? schema : []) {
    out[param.key] = resolveNodeValue(param, src[param.key]);
  }
  return out;
}

/** Clés stockées qui ne sont plus déclarées par la version épinglée. */
export function orphanParamKeys(
  schema: TemplateParamSchema[],
  values: TemplateParamValues,
): string[] {
  const known = new Set(schema.map((param) => param.key));
  return Object.keys(values).filter((key) => !known.has(key));
}
