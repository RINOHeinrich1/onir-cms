/**
 * Contrats de données des templates visuels (ADR-0026).
 *
 * Le template déclare les ressources dont il a besoin sous forme de schémas
 * (sous-ensemble strict de JSON Schema 2020-12). Le cœur valide ces contrats à
 * l'import puis les données à l'exécution, sans connaître aucun nom métier.
 */

export const DATA_CONTRACT_LIMITS = {
  maxContracts: 20,
  maxBlockBytes: 64 * 1024,
  maxInputs: 10,
  maxSchemaDepth: 12,
  maxSchemaNodes: 500,
  maxProperties: 64,
  maxEnumValues: 50,
  maxRequired: 64,
  maxStringLength: 2000,
  maxArrayItems: 1000,
  maxLabel: 80,
  maxDescription: 200,
  maxVersion: 1000,
} as const;

export const DATA_CONTRACT_LOADING = ["lazy", "eager"] as const;
export type DataContractLoading = (typeof DATA_CONTRACT_LOADING)[number];

export const DATA_INPUT_TYPES = ["string", "number", "integer", "boolean"] as const;
export type DataInputType = (typeof DATA_INPUT_TYPES)[number];

export const JSON_SCHEMA_TYPES = [
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
] as const;
export type JsonSchemaType = (typeof JSON_SCHEMA_TYPES)[number];

export const JSON_SCHEMA_FORMATS = ["uri", "date", "date-time", "email"] as const;
export type JsonSchemaFormat = (typeof JSON_SCHEMA_FORMATS)[number];

export type JsonSchemaValue = string | number | boolean;

export type JsonSchemaNode = {
  type: JsonSchemaType;
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode;
  enum?: JsonSchemaValue[];
  const?: JsonSchemaValue;
  format?: JsonSchemaFormat;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean;
};

export type DataInputDeclaration = {
  key: string;
  type: DataInputType;
  required: boolean;
};

export type TemplateDataContract = {
  key: string;
  label: string;
  description: string;
  version: number;
  loading: DataContractLoading;
  inputs: DataInputDeclaration[];
  schema: JsonSchemaNode;
};

export type DataContractError = { field: string; message: string };
export type DataValueError = { path: string; message: string };

export type DataContractValidation =
  | { ok: true; value: TemplateDataContract[] }
  | { ok: false; errors: DataContractError[] };

const KEY = /^[a-z][a-z0-9_]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROPERTY_KEY_MAX = 64;

const COMMON_KEYS = ["type", "enum", "const"] as const;
const KEYS_BY_TYPE: Record<JsonSchemaType, readonly string[]> = {
  object: [...COMMON_KEYS, "properties", "required", "additionalProperties"],
  array: [...COMMON_KEYS, "items", "minItems", "maxItems"],
  string: [...COMMON_KEYS, "minLength", "maxLength", "format"],
  number: [...COMMON_KEYS, "minimum", "maximum"],
  integer: [...COMMON_KEYS, "minimum", "maximum"],
  boolean: [...COMMON_KEYS],
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function utf8Bytes(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function isInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isValueOfType(value: unknown, type: JsonSchemaType): value is JsonSchemaValue {
  if (type === "string") return typeof value === "string";
  if (type === "boolean") return typeof value === "boolean";
  if (type === "integer") return isInteger(value);
  return isFiniteNumber(value);
}

type SchemaResult =
  | { ok: true; value: JsonSchemaNode }
  | { ok: false; errors: DataContractError[] };

/** Valide un nœud de schéma et renvoie sa forme normalisée (défauts appliqués). */
function validateSchemaNode(
  raw: unknown,
  field: string,
  depth: number,
  counter: { nodes: number },
): SchemaResult {
  const errors: DataContractError[] = [];
  const add = (path: string, message: string) => errors.push({ field: `${field}${path}`, message });

  if (depth > DATA_CONTRACT_LIMITS.maxSchemaDepth) {
    return {
      ok: false,
      errors: [{ field, message: `profondeur > ${DATA_CONTRACT_LIMITS.maxSchemaDepth}` }],
    };
  }
  counter.nodes += 1;
  if (counter.nodes > DATA_CONTRACT_LIMITS.maxSchemaNodes) {
    return {
      ok: false,
      errors: [{ field, message: `plus de ${DATA_CONTRACT_LIMITS.maxSchemaNodes} nœuds` }],
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ field, message: "objet schéma attendu" }] };
  }

  const src = raw as Record<string, unknown>;
  const type = typeof src.type === "string" ? src.type : "";
  if (!(JSON_SCHEMA_TYPES as readonly string[]).includes(type)) {
    add(".type", `type ∈ ${JSON_SCHEMA_TYPES.join(", ")}`);
    return { ok: false, errors };
  }
  const kind = type as JsonSchemaType;
  const allowed = KEYS_BY_TYPE[kind];
  for (const key of Object.keys(src)) {
    if (!allowed.includes(key)) add(`.${key}`, `clé non autorisée pour le type ${kind}`);
  }

  if (src.enum !== undefined && src.const !== undefined) {
    add("", "enum et const sont exclusifs");
  }
  if (src.enum !== undefined) {
    if (
      !Array.isArray(src.enum) ||
      src.enum.length === 0 ||
      src.enum.length > DATA_CONTRACT_LIMITS.maxEnumValues
    ) {
      add(".enum", `enum : tableau de 1 à ${DATA_CONTRACT_LIMITS.maxEnumValues} valeurs`);
    } else {
      const seen = new Set<string>();
      for (const entry of src.enum) {
        if (!isValueOfType(entry, kind)) add(".enum", `valeur incompatible avec le type ${kind}`);
        const token = JSON.stringify(entry);
        if (seen.has(token)) add(".enum", "valeur dupliquée");
        seen.add(token);
      }
    }
  }
  if (src.const !== undefined && !isValueOfType(src.const, kind)) {
    add(".const", `valeur incompatible avec le type ${kind}`);
  }

  const node: JsonSchemaNode = { type: kind };
  if (Array.isArray(src.enum)) node.enum = src.enum as JsonSchemaValue[];
  if (src.const !== undefined && isValueOfType(src.const, kind)) node.const = src.const;

  if (kind === "object") {
    const properties = src.properties;
    const required = src.required;
    const propNames: string[] = [];
    if (properties !== undefined) {
      if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
        add(".properties", "objet attendu");
      } else {
        const entries = Object.entries(properties as Record<string, unknown>);
        if (entries.length > DATA_CONTRACT_LIMITS.maxProperties) {
          add(".properties", `au plus ${DATA_CONTRACT_LIMITS.maxProperties} propriétés`);
        }
        const built: Record<string, JsonSchemaNode> = {};
        for (const [name, child] of entries) {
          if (name === "" || name.length > PROPERTY_KEY_MAX) {
            add(".properties", "nom de propriété vide ou trop long");
            continue;
          }
          propNames.push(name);
          const result = validateSchemaNode(child, `.properties.${name}`, depth + 1, counter);
          if (!result.ok) errors.push(...result.errors);
          else built[name] = result.value;
        }
        node.properties = built;
      }
    }
    if (required !== undefined) {
      if (!Array.isArray(required) || required.length > DATA_CONTRACT_LIMITS.maxRequired) {
        add(".required", `tableau de 0 à ${DATA_CONTRACT_LIMITS.maxRequired} clés`);
      } else {
        const seen = new Set<string>();
        const keys: string[] = [];
        for (const entry of required) {
          if (typeof entry !== "string") {
            add(".required", "chaînes attendues");
            continue;
          }
          if (seen.has(entry)) add(".required", `doublon : ${entry}`);
          if (!propNames.includes(entry)) add(".required", `clé absente des properties : ${entry}`);
          seen.add(entry);
          keys.push(entry);
        }
        node.required = keys;
      }
    }
    node.additionalProperties = src.additionalProperties === true;
    if (src.additionalProperties !== undefined && typeof src.additionalProperties !== "boolean") {
      add(".additionalProperties", "booléen attendu");
    }
  }

  if (kind === "array") {
    if (src.items === undefined) {
      add(".items", "items est requis pour un tableau");
    } else {
      const result = validateSchemaNode(src.items, ".items", depth + 1, counter);
      if (!result.ok) errors.push(...result.errors);
      else node.items = result.value;
    }
    for (const key of ["minItems", "maxItems"] as const) {
      const value = src[key];
      if (value === undefined) continue;
      if (!isInteger(value) || value < 0 || value > DATA_CONTRACT_LIMITS.maxArrayItems) {
        add(`.${key}`, `entier entre 0 et ${DATA_CONTRACT_LIMITS.maxArrayItems}`);
      } else {
        node[key] = value;
      }
    }
    if (
      node.minItems !== undefined &&
      node.maxItems !== undefined &&
      node.minItems > node.maxItems
    ) {
      add(".minItems", "minItems > maxItems");
    }
  }

  if (kind === "string") {
    for (const key of ["minLength", "maxLength"] as const) {
      const value = src[key];
      if (value === undefined) continue;
      if (!isInteger(value) || value < 0 || value > DATA_CONTRACT_LIMITS.maxStringLength) {
        add(`.${key}`, `entier entre 0 et ${DATA_CONTRACT_LIMITS.maxStringLength}`);
      } else {
        node[key] = value;
      }
    }
    if (
      node.minLength !== undefined &&
      node.maxLength !== undefined &&
      node.minLength > node.maxLength
    ) {
      add(".minLength", "minLength > maxLength");
    }
    if (src.format !== undefined) {
      if (
        typeof src.format !== "string" ||
        !(JSON_SCHEMA_FORMATS as readonly string[]).includes(src.format)
      ) {
        add(".format", `format ∈ ${JSON_SCHEMA_FORMATS.join(", ")}`);
      } else {
        node.format = src.format as JsonSchemaFormat;
      }
    }
  }

  if (kind === "number" || kind === "integer") {
    for (const key of ["minimum", "maximum"] as const) {
      const value = src[key];
      if (value === undefined) continue;
      if (!isFiniteNumber(value)) add(`.${key}`, "nombre fini attendu");
      else node[key] = value;
    }
    if (node.minimum !== undefined && node.maximum !== undefined && node.minimum > node.maximum) {
      add(".minimum", "minimum > maximum");
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: node };
}

function validateInput(
  raw: unknown,
  field: string,
): { ok: true; value: DataInputDeclaration } | { ok: false; errors: DataContractError[] } {
  const errors: DataContractError[] = [];
  const add = (path: string, message: string) => errors.push({ field: `${field}${path}`, message });
  const src = record(raw);
  for (const key of Object.keys(src)) {
    if (!["key", "type", "required"].includes(key)) add(`.${key}`, "clé non autorisée");
  }
  const key = typeof src.key === "string" ? src.key : "";
  if (!KEY.test(key)) add(".key", "clé attendue : ^[a-z][a-z0-9_]{1,40}$");
  const type = typeof src.type === "string" ? src.type : "";
  if (!(DATA_INPUT_TYPES as readonly string[]).includes(type)) {
    add(".type", `type ∈ ${DATA_INPUT_TYPES.join(", ")}`);
  }
  if (src.required !== undefined && typeof src.required !== "boolean")
    add(".required", "booléen attendu");
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: { key, type: type as DataInputType, required: src.required === true } };
}

/** Valide le bloc `data` du manifeste (contrats déclarés par le template). */
export function validateTemplateDataBlock(raw: unknown): DataContractValidation {
  const errors: DataContractError[] = [];
  const add = (field: string, message: string) => errors.push({ field, message });
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: [{ field: "data", message: "objet { contracts: [...] } attendu" }],
    };
  }
  const src = record(raw);
  for (const key of Object.keys(src)) {
    if (key !== "contracts") add(`data.${key}`, "clé non autorisée");
  }
  const contracts = src.contracts;
  if (!Array.isArray(contracts)) {
    return {
      ok: false,
      errors: [...errors, { field: "data.contracts", message: "tableau attendu" }],
    };
  }
  if (contracts.length === 0) {
    add("data.contracts", "au moins un contrat est requis");
  }
  if (contracts.length > DATA_CONTRACT_LIMITS.maxContracts) {
    add("data.contracts", `au plus ${DATA_CONTRACT_LIMITS.maxContracts} contrats`);
  }
  if (utf8Bytes(raw) > DATA_CONTRACT_LIMITS.maxBlockBytes) {
    add("data", `bloc > ${DATA_CONTRACT_LIMITS.maxBlockBytes} octets`);
  }

  const seen = new Set<string>();
  const value: TemplateDataContract[] = [];
  contracts.forEach((entry, index) => {
    const base = `data.contracts[${index}]`;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      add(base, "objet attendu");
      return;
    }
    const contract = record(entry);
    for (const key of Object.keys(contract)) {
      if (
        !["key", "label", "description", "version", "loading", "inputs", "schema"].includes(key)
      ) {
        add(`${base}.${key}`, "clé non autorisée");
      }
    }
    const key = typeof contract.key === "string" ? contract.key : "";
    if (!KEY.test(key)) add(`${base}.key`, "clé attendue : ^[a-z][a-z0-9_]{1,40}$");
    else if (seen.has(key)) add(`${base}.key`, `clé dupliquée : ${key}`);
    else seen.add(key);

    const label = typeof contract.label === "string" ? contract.label.trim() : "";
    if (label === "" || label.length > DATA_CONTRACT_LIMITS.maxLabel) {
      add(`${base}.label`, `1 à ${DATA_CONTRACT_LIMITS.maxLabel} caractères`);
    }
    const description = typeof contract.description === "string" ? contract.description.trim() : "";
    if (description.length > DATA_CONTRACT_LIMITS.maxDescription) {
      add(`${base}.description`, `au plus ${DATA_CONTRACT_LIMITS.maxDescription} caractères`);
    }
    const version = contract.version;
    if (!isInteger(version) || version < 1 || version > DATA_CONTRACT_LIMITS.maxVersion) {
      add(`${base}.version`, `entier entre 1 et ${DATA_CONTRACT_LIMITS.maxVersion}`);
    }
    const loading = contract.loading === undefined ? "lazy" : contract.loading;
    if (
      typeof loading !== "string" ||
      !(DATA_CONTRACT_LOADING as readonly string[]).includes(loading)
    ) {
      add(`${base}.loading`, `loading ∈ ${DATA_CONTRACT_LOADING.join(", ")}`);
    }

    const inputsRaw = contract.inputs === undefined ? [] : contract.inputs;
    const inputs: DataInputDeclaration[] = [];
    if (!Array.isArray(inputsRaw)) {
      add(`${base}.inputs`, "tableau attendu");
    } else if (inputsRaw.length > DATA_CONTRACT_LIMITS.maxInputs) {
      add(`${base}.inputs`, `au plus ${DATA_CONTRACT_LIMITS.maxInputs} entrées`);
    } else {
      const inputKeys = new Set<string>();
      inputsRaw.forEach((inputRaw, inputIndex) => {
        const result = validateInput(inputRaw, `${base}.inputs[${inputIndex}]`);
        if (!result.ok) {
          errors.push(...result.errors);
          return;
        }
        if (inputKeys.has(result.value.key))
          add(`${base}.inputs[${inputIndex}].key`, "entrée dupliquée");
        inputKeys.add(result.value.key);
        inputs.push(result.value);
      });
    }

    const schema = validateSchemaNode(contract.schema, `${base}.schema`, 1, { nodes: 0 });
    if (!schema.ok) errors.push(...schema.errors);

    if (
      typeof key === "string" &&
      KEY.test(key) &&
      typeof label === "string" &&
      label !== "" &&
      schema.ok
    ) {
      value.push({
        key,
        label,
        description,
        version:
          isInteger(version) && version >= 1 && version <= DATA_CONTRACT_LIMITS.maxVersion
            ? version
            : 1,
        loading: (typeof loading === "string" &&
        (DATA_CONTRACT_LOADING as readonly string[]).includes(loading)
          ? loading
          : "lazy") as DataContractLoading,
        inputs,
        schema: schema.value,
      });
    }
  });

  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

function formatIsValid(format: JsonSchemaFormat, value: string): boolean {
  if (format === "uri") {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }
  if (format === "date") {
    if (!DATE.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time);
  }
  if (format === "date-time") return Number.isFinite(Date.parse(value));
  return EMAIL.test(value);
}

/** Valide une valeur (document assemblé) contre un schéma de contrat. */
export function validateDataValue(
  schema: JsonSchemaNode,
  value: unknown,
  path = "",
): DataValueError[] {
  const errors: DataValueError[] = [];
  const at = path === "" ? "$" : path;
  const add = (message: string) => errors.push({ path: at, message });

  if (schema.const !== undefined && value !== schema.const) add("valeur différente de const");
  if (schema.enum !== undefined && !schema.enum.some((entry) => entry === value))
    add("valeur hors enum");

  switch (schema.type) {
    case "object": {
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        add("objet attendu");
        return errors;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in obj))
          errors.push({ path: `${path}.${key}`, message: "propriété requise absente" });
      }
      const properties = schema.properties ?? {};
      for (const [key, child] of Object.entries(obj)) {
        if (errors.length >= 50) break;
        const childSchema = properties[key];
        if (childSchema) {
          errors.push(...validateDataValue(childSchema, child, `${path}.${key}`));
        } else if (!schema.additionalProperties) {
          errors.push({ path: `${path}.${key}`, message: "propriété non déclarée" });
        }
      }
      break;
    }
    case "array": {
      if (!Array.isArray(value)) {
        add("tableau attendu");
        return errors;
      }
      if (schema.minItems !== undefined && value.length < schema.minItems)
        add(`moins de ${schema.minItems} éléments`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems)
        add(`plus de ${schema.maxItems} éléments`);
      if (schema.items) {
        for (let index = 0; index < value.length && errors.length < 50; index++) {
          errors.push(...validateDataValue(schema.items, value[index], `${path}[${index}]`));
        }
      }
      break;
    }
    case "string": {
      if (typeof value !== "string") {
        add("chaîne attendue");
        return errors;
      }
      if (schema.minLength !== undefined && value.length < schema.minLength)
        add(`longueur < ${schema.minLength}`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength)
        add(`longueur > ${schema.maxLength}`);
      if (schema.format && !formatIsValid(schema.format, value))
        add(`format ${schema.format} invalide`);
      break;
    }
    case "number":
    case "integer": {
      if (!isFiniteNumber(value) || (schema.type === "integer" && !isInteger(value))) {
        add(schema.type === "integer" ? "entier attendu" : "nombre attendu");
        return errors;
      }
      if (schema.minimum !== undefined && value < schema.minimum) add(`< ${schema.minimum}`);
      if (schema.maximum !== undefined && value > schema.maximum) add(`> ${schema.maximum}`);
      break;
    }
    case "boolean": {
      if (typeof value !== "boolean") add("booléen attendu");
      break;
    }
  }
  return errors;
}
