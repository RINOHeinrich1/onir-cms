/**
 * Variables paramétrables des templates visuels (ADR-0023).
 *
 * Contrat **générique** : le cœur ne connaît aucun paramètre nommé. Il manipule
 * un schéma (données JSON déclarées par le template), un sac de valeurs scalaires
 * stocké sur le lien, et une résolution par type. La sémantique métier
 * (`titre_de_livre`, …) reste entièrement dans le template.
 */

export const TEMPLATE_PARAM_TYPES = [
  "string",
  "text",
  "number",
  "boolean",
  "color",
  "url",
  "select",
] as const;

export type TemplateParamType = (typeof TEMPLATE_PARAM_TYPES)[number];

export type TemplateParamOption = { value: string; label: string };

export type TemplateParamValue = string | number | boolean;

export type TemplateParamValues = Record<string, TemplateParamValue>;

export type TemplateParamSchema = {
  key: string;
  label: string;
  description: string;
  type: TemplateParamType;
  /** Toujours présent : aucun paramètre sans défaut (ADR-0023). */
  default: TemplateParamValue;
  /** `string` / `text` uniquement (défaut 200). */
  maxLength?: number;
  /** `number` uniquement. */
  min?: number;
  max?: number;
  /** `select` uniquement. */
  options?: TemplateParamOption[];
};

export type TemplateParamError = { field: string; message: string };

export const MAX_TEMPLATE_PARAMS = 40;
export const MAX_TEMPLATE_PARAMS_JSON_BYTES = 16 * 1024;
export const MAX_TEMPLATE_PARAM_STRING = 2000;
export const DEFAULT_TEMPLATE_PARAM_MAX_LENGTH = 200;
export const MAX_TEMPLATE_PARAM_OPTIONS = 40;

const KEY = /^[a-z][a-z0-9_]{1,40}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isScalar(value: unknown): value is TemplateParamValue {
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

/**
 * Valide le bloc `params` d'un manifeste. `undefined` est valide (aucun
 * paramètre). Les champs inconnus d'un paramètre sont ignorés (projection).
 */
export function validateTemplateParamSchema(
  input: unknown,
): { ok: true; value: TemplateParamSchema[] } | { ok: false; errors: TemplateParamError[] } {
  if (input === undefined || input === null) return { ok: true, value: [] };
  const errors: TemplateParamError[] = [];
  if (!Array.isArray(input)) {
    return { ok: false, errors: [{ field: "params", message: "params doit être une liste" }] };
  }
  if (input.length > MAX_TEMPLATE_PARAMS) {
    return {
      ok: false,
      errors: [
        { field: "params", message: `au plus ${MAX_TEMPLATE_PARAMS} paramètres sont autorisés` },
      ],
    };
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

  const seen = new Set<string>();
  const out: TemplateParamSchema[] = [];

  input.forEach((entry, index) => {
    const base = `params[${index}]`;
    const src = record(entry);
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push({ field: base, message: "un paramètre doit être un objet" });
      return;
    }
    const key = text(src.key);
    if (!KEY.test(key)) {
      errors.push({
        field: `${base}.key`,
        message: "clé en minuscules, chiffres et _ (^[a-z][a-z0-9_]{1,40}$)",
      });
    } else if (seen.has(key)) {
      errors.push({ field: `${base}.key`, message: `clé dupliquée : ${key}` });
    } else {
      seen.add(key);
    }
    const label = text(src.label);
    if (label === "" || label.length > 80) {
      errors.push({ field: `${base}.label`, message: "libellé requis (1..80 caractères)" });
    }
    const description = text(src.description);
    if (description.length > 200) {
      errors.push({
        field: `${base}.description`,
        message: "description limitée à 200 caractères",
      });
    }
    const type = text(src.type);
    if (!(TEMPLATE_PARAM_TYPES as readonly string[]).includes(type)) {
      errors.push({
        field: `${base}.type`,
        message: `type ∈ ${TEMPLATE_PARAM_TYPES.join(", ")}`,
      });
      return;
    }
    if (!("default" in src)) {
      errors.push({ field: `${base}.default`, message: "valeur par défaut obligatoire" });
      return;
    }
    const value = src.default;
    const param: TemplateParamSchema = {
      key: key === "" ? `param_${index}` : key,
      label: label === "" ? key : label,
      description,
      type: type as TemplateParamType,
      default: "" as TemplateParamValue,
    };

    switch (param.type) {
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
      case "select": {
        if (!Array.isArray(src.options) || src.options.length === 0) {
          errors.push({
            field: `${base}.options`,
            message: "select exige au moins une option",
          });
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
    }

    out.push(param);
  });

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: out };
}

/**
 * Normalise un sac de valeurs **stocké** : ne garde que des scalaires (chaînes,
 * nombres finis, booléens), tronque les chaînes trop longues et borne la taille
 * totale. Les clés inconnues du schéma sont **conservées** (valeurs « plus
 * utilisées »), jamais supprimées ici.
 */
export function normalizeTemplateParamValues(input: unknown): TemplateParamValues {
  const src = record(input);
  const out: TemplateParamValues = {};
  for (const [key, value] of Object.entries(src)) {
    if (!isScalar(value)) continue;
    if (typeof value === "string" && value.length > MAX_TEMPLATE_PARAM_STRING) continue;
    out[key] = value;
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

/** Un défaut de schéma est toujours une valeur valide (garanti à l'import). */
export function isValidParamValue(
  param: TemplateParamSchema,
  value: unknown,
): value is TemplateParamValue {
  switch (param.type) {
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
    case "select":
      return (
        typeof value === "string" && (param.options ?? []).some((option) => option.value === value)
      );
  }
}

/**
 * Validation **stricte** des valeurs connues du schéma (enregistrement du lien).
 * Les clés inconnues ne sont pas des erreurs : elles sont conservées comme
 * « plus utilisées ».
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
    if (!isValidParamValue(param, value)) {
      errors.push({ field: param.key, message: `valeur invalide pour « ${param.label} »` });
    }
  }
  return errors;
}

/**
 * Résolution **tolérante** (chargement public) : `défauts ← valeurs`, une valeur
 * invalide retombe sur le défaut, une clé inconnue est ignorée. Le résultat ne
 * contient que les clés du schéma.
 */
export function resolveTemplateParams(
  schema: TemplateParamSchema[] | null | undefined,
  values: unknown,
): TemplateParamValues {
  const src = record(values);
  const out: TemplateParamValues = {};
  const list = Array.isArray(schema) ? schema : [];
  for (const param of list) {
    const value = src[param.key];
    out[param.key] = value !== undefined && isValidParamValue(param, value) ? value : param.default;
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
