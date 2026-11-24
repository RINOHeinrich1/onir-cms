/**
 * Contrat d’édition des templates visuels (ADR-0105).
 *
 * Le cœur ne connaît aucune zone métier : un template déclare des régions
 * sélectionnables et les paramètres qui leur sont rattachés. Ce module valide
 * cette déclaration contre le schéma de paramètres de la version.
 */

import type {
  TemplateParamNode,
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "./template-params";

export const TEMPLATE_EDITOR_CATEGORIES = ["content", "appearance", "action"] as const;
export type TemplateEditorCategory = (typeof TEMPLATE_EDITOR_CATEGORIES)[number];

export type TemplateEditorRegion = {
  id: string;
  label: string;
  parent?: string;
  visibilityParam?: string;
};

export type TemplateEditorBinding = {
  param: string;
  regions: string[];
  category: TemplateEditorCategory;
};

export type TemplateEditorManifestV1 = {
  version: 1;
  regions: TemplateEditorRegion[];
  bindings: TemplateEditorBinding[];
};

export type TemplateEditorCollection = {
  param: string;
  label: string;
  itemKey: string;
  itemLabel?: string;
  itemKind?: string;
  labelFallback?: string[];
};

export type TemplateEditorDynamicRegion = {
  idPattern: string;
  collection: string;
  keyField: string;
};

export type TemplateEditorResolvedRegion = {
  regionId: string;
  collection: string;
  keyField: string;
  itemId: string;
  collectionLabel: string;
};

export type TemplateEditorRegionItem = TemplateEditorResolvedRegion & {
  item: Record<string, TemplateParamValue>;
  index: number;
};

export type TemplateEditorBindingV2 = TemplateEditorBinding & {
  itemKey?: string;
  itemId?: string;
};

export type TemplateEditorVisibleWhen = {
  field: string;
  equals?: string | number | boolean;
  notEquals?: string | number | boolean;
  in?: (string | number | boolean)[];
  notIn?: (string | number | boolean)[];
  truthy?: boolean;
  falsy?: boolean;
};

export type TemplateEditorFieldRule = {
  param: string;
  field: string;
  visibleWhen?: TemplateEditorVisibleWhen;
};

export type TemplateEditorGroup = {
  param: string;
  id: string;
  label: string;
  fields: string[];
  collapsedByDefault?: boolean;
};

export type TemplateEditorReference = {
  from: string;
  field: string;
  to?: string;
  targets?: Record<string, string>;
  discriminator?: string;
  targetKey: string;
  optional?: boolean;
  onDelete?: "clear" | "cascade" | "restrict";
};

export type TemplateEditorStructure = {
  roots: string;
  regions?: { collection: string; fields: string[] };
  children?: {
    collection: string;
    through: string;
    parentKey: string;
    parentKindKey?: string;
    childKey: string;
    orderKey?: string;
    slotKey?: string;
  };
};

export type TemplateEditorInsertionRule = {
  parentKind: string;
  childCollection: string;
  allowedKinds: string[];
  slot: string;
  maxItems?: number;
  defaults?: Record<string, Record<string, TemplateParamValue>>;
};

export type TemplateEditorScope = {
  param: string;
  scope: "global" | "shared" | "page" | "local";
};

export type TemplateEditorManifestV2 = {
  version: 2;
  regions: TemplateEditorRegion[];
  bindings: TemplateEditorBindingV2[];
  collections?: TemplateEditorCollection[];
  dynamicRegions?: TemplateEditorDynamicRegion[];
  fields?: TemplateEditorFieldRule[];
  groups?: TemplateEditorGroup[];
  valueLabels?: Record<string, Record<string, Record<string, string>>>;
  references?: TemplateEditorReference[];
  structure?: TemplateEditorStructure;
  insertion?: TemplateEditorInsertionRule[];
  scopes?: TemplateEditorScope[];
};

export type TemplateEditorManifest = TemplateEditorManifestV1 | TemplateEditorManifestV2;

export type TemplateEditorError = { field: string; message: string };

export type TemplateEditorValidation =
  | { ok: true; value: TemplateEditorManifest | undefined }
  | { ok: false; errors: TemplateEditorError[] };

const EDITOR_VERSION = 1;
const MAX_REGIONS = 64;
const MAX_BINDINGS = 128;
const ID = /^[a-z][a-z0-9_-]{0,40}$/;
const PARAM_KEY = /^[a-z][a-z0-9_]{0,40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function findParamNode(schema: TemplateParamSchema[], path: string): TemplateParamNode | null {
  const segments = path.split(".");
  if (segments.length === 0) return null;
  const first = segments[0] ?? "";
  let current: TemplateParamNode | undefined = schema.find((entry) => entry.key === first);
  for (let index = 1; index < segments.length; index += 1) {
    if (current === undefined) return null;
    const segment = segments[index] ?? "";
    if (current.type === "object") {
      current = current.properties?.find((entry) => entry.key === segment);
      continue;
    }
    if (current.type === "array") {
      return null;
    }
    return null;
  }
  return current ?? null;
}

function validParamPath(path: string): boolean {
  if (path === "") return false;
  return path.split(".").every((segment) => PARAM_KEY.test(segment));
}

/** Valide le bloc `editor` optionnel d’un manifeste. */
function matchDynamicPattern(pattern: string, regionId: string): boolean {
  const open = pattern.indexOf("{");
  const close = pattern.indexOf("}", open + 1);
  if (open < 0 || close < 0) return false;
  const prefix = pattern.slice(0, open);
  const suffix = pattern.slice(close + 1);
  return (
    regionId.startsWith(prefix) &&
    regionId.endsWith(suffix) &&
    regionId.length > prefix.length + suffix.length
  );
}

export function validateTemplateEditorBlock(
  input: unknown,
  params: TemplateParamSchema[],
  options: { dynamicPatterns?: string[]; allowDuplicateParams?: boolean } = {},
): TemplateEditorValidation {
  if (input === undefined) return { ok: true, value: undefined };
  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: "editor", message: "objet editor attendu" }] };
  }

  if (input.version === 2) return validateTemplateEditorV2(input, params);

  const errors: TemplateEditorError[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
  };

  if (input.version !== EDITOR_VERSION) {
    add("editor.version", `version doit valoir ${EDITOR_VERSION} ou 2`);
  }

  const rawRegions = input.regions;
  const rawBindings = input.bindings;
  if (!Array.isArray(rawRegions)) {
    add("editor.regions", "liste regions attendue");
  }
  if (!Array.isArray(rawBindings)) {
    add("editor.bindings", "liste bindings attendue");
  }

  const regions: TemplateEditorRegion[] = [];
  const regionIds = new Map<string, number>();
  if (Array.isArray(rawRegions)) {
    if (rawRegions.length === 0) add("editor.regions", "au moins une région");
    if (rawRegions.length > MAX_REGIONS) {
      add("editor.regions", `au plus ${MAX_REGIONS} régions`);
    }
    rawRegions.forEach((raw, index) => {
      const base = `editor.regions[${index}]`;
      if (!isRecord(raw)) {
        add(base, "objet région attendu");
        return;
      }
      const id = text(raw.id);
      const label = text(raw.label);
      if (!ID.test(id)) add(`${base}.id`, "id de région invalide");
      if (label === "") add(`${base}.label`, "libellé requis");
      if (regionIds.has(id)) add(`${base}.id`, "id de région dupliqué");
      regionIds.set(id, index);

      const parent = raw.parent === undefined ? undefined : text(raw.parent);
      if (parent !== undefined && parent !== "" && !ID.test(parent)) {
        add(`${base}.parent`, "parent invalide");
      }
      const visibilityParam =
        raw.visibilityParam === undefined ? undefined : text(raw.visibilityParam);
      if (visibilityParam !== undefined && visibilityParam !== "") {
        if (!validParamPath(visibilityParam)) {
          add(`${base}.visibilityParam`, "chemin de paramètre invalide");
        } else {
          const node = findParamNode(params, visibilityParam);
          if (node === null) add(`${base}.visibilityParam`, "paramètre inexistant");
          else if (node.type !== "boolean") add(`${base}.visibilityParam`, "booléen attendu");
        }
      }
      regions.push({
        id,
        label,
        ...(parent === undefined || parent === "" ? {} : { parent }),
        ...(visibilityParam === undefined || visibilityParam === "" ? {} : { visibilityParam }),
      });
    });
  }

  for (const region of regions) {
    if (region.parent !== undefined && !regionIds.has(region.parent)) {
      add("editor.regions", `parent inconnu : ${region.parent}`);
    }
  }

  // Détection de cycles dans la hiérarchie des régions.
  const byId = new Map(regions.map((region) => [region.id, region]));
  for (const region of regions) {
    const seen = new Set<string>();
    let current: TemplateEditorRegion | undefined = region;
    while (current?.parent !== undefined) {
      if (seen.has(current.id)) {
        add("editor.regions", `cycle de parents autour de ${region.id}`);
        break;
      }
      seen.add(current.id);
      current = byId.get(current.parent);
    }
  }

  const bindings: TemplateEditorBinding[] = [];
  const paramsSeen = new Set<string>();
  if (Array.isArray(rawBindings)) {
    if (rawBindings.length === 0) add("editor.bindings", "au moins un binding");
    if (rawBindings.length > MAX_BINDINGS) {
      add("editor.bindings", `au plus ${MAX_BINDINGS} bindings`);
    }
    rawBindings.forEach((raw, index) => {
      const base = `editor.bindings[${index}]`;
      if (!isRecord(raw)) {
        add(base, "objet binding attendu");
        return;
      }
      const param = text(raw.param);
      if (!validParamPath(param)) add(`${base}.param`, "chemin de paramètre invalide");
      if (findParamNode(params, param) === null) add(`${base}.param`, "paramètre inexistant");
      if (!options.allowDuplicateParams && paramsSeen.has(param)) {
        add(`${base}.param`, "binding dupliqué");
      }
      paramsSeen.add(param);

      const rawRegionsForBinding = raw.regions;
      const bindingRegions = Array.isArray(rawRegionsForBinding)
        ? rawRegionsForBinding.filter((entry): entry is string => typeof entry === "string")
        : [];
      if (bindingRegions.length === 0) add(`${base}.regions`, "au moins une région");
      for (const regionId of bindingRegions) {
        const dynamic = (options.dynamicPatterns ?? []).some((pattern) =>
          matchDynamicPattern(pattern, regionId),
        );
        if (!regionIds.has(regionId) && !dynamic) {
          add(`${base}.regions`, `région inconnue : ${regionId}`);
        }
      }

      const category = text(raw.category);
      if (!(TEMPLATE_EDITOR_CATEGORIES as readonly string[]).includes(category)) {
        add(`${base}.category`, `catégorie ∈ ${TEMPLATE_EDITOR_CATEGORIES.join(", ")}`);
      }
      bindings.push({
        param,
        regions: [...new Set(bindingRegions)],
        category: category as TemplateEditorCategory,
      });
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      version: EDITOR_VERSION,
      regions,
      bindings,
    },
  };
}

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function objectFieldsForParam(params: TemplateParamSchema[], param: string): TemplateParamSchema[] {
  const node = findParamNode(params, param);
  if (node === null) return [];
  if (node.type === "object") return node.properties ?? [];
  if (node.type === "array" && node.items?.type === "object") return node.items.properties ?? [];
  return [];
}

function isScalarValue(value: unknown): value is string | number | boolean {
  return (
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function scalarMatchesField(field: TemplateParamSchema, value: unknown): boolean {
  if (field.type === "number") return typeof value === "number" && Number.isFinite(value);
  if (field.type === "boolean") return typeof value === "boolean";
  if (field.type === "select") {
    return (
      typeof value === "string" && (field.options ?? []).some((option) => option.value === value)
    );
  }
  if (
    field.type === "string" ||
    field.type === "text" ||
    field.type === "color" ||
    field.type === "url" ||
    field.type === "image"
  ) {
    return typeof value === "string";
  }
  return false;
}

function validateTemplateEditorV2(
  input: Record<string, unknown>,
  params: TemplateParamSchema[],
): TemplateEditorValidation {
  const rawDynamicPatterns = Array.isArray(input.dynamicRegions)
    ? input.dynamicRegions
        .map((raw) => (isRecord(raw) ? text(raw.idPattern) : ""))
        .filter((pattern) => pattern !== "")
    : [];
  const base = validateTemplateEditorBlock({ ...input, version: 1 }, params, {
    dynamicPatterns: rawDynamicPatterns,
    allowDuplicateParams: true,
  });
  if (!base.ok || base.value === undefined) return base;
  const errors: TemplateEditorError[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
  };

  const collectionParams = new Set<string>();
  const rawCollections = input.collections;
  const collections: TemplateEditorCollection[] = [];
  if (rawCollections !== undefined) {
    if (!Array.isArray(rawCollections)) {
      add("editor.collections", "liste collections attendue");
    } else {
      if (rawCollections.length > 64) add("editor.collections", "au plus 64 collections");
      rawCollections.forEach((raw, index) => {
        const basePath = `editor.collections[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet collection attendu");
          return;
        }
        const param = text(raw.param);
        const label = text(raw.label);
        const itemKey = text(raw.itemKey);
        const node = findParamNode(params, param);
        if (node === null || node.type !== "array" || node.items?.type !== "object") {
          add(`${basePath}.param`, "collection array d'objets attendue");
        }
        if (label === "") add(`${basePath}.label`, "libellé requis");
        if (itemKey === "") add(`${basePath}.itemKey`, "itemKey requis");
        const itemNode = node?.items;
        const itemProps = itemNode?.type === "object" ? (itemNode.properties ?? []) : [];
        if (itemKey !== "" && !itemProps.some((entry) => entry.key === itemKey)) {
          add(`${basePath}.itemKey`, "itemKey absent de l'élément");
        }
        if (collectionParams.has(param)) add(`${basePath}.param`, "collection dupliquée");
        collectionParams.add(param);
        const itemLabel = raw.itemLabel === undefined ? undefined : text(raw.itemLabel);
        if (
          itemLabel !== undefined &&
          itemLabel !== "" &&
          !itemProps.some((p) => p.key === itemLabel)
        ) {
          add(`${basePath}.itemLabel`, "itemLabel absent de l'élément");
        }
        const itemKind = raw.itemKind === undefined ? undefined : text(raw.itemKind);
        if (
          itemKind !== undefined &&
          itemKind !== "" &&
          !itemProps.some((p) => p.key === itemKind)
        ) {
          add(`${basePath}.itemKind`, "itemKind absent de l'élément");
        }
        const fallback = Array.isArray(raw.labelFallback)
          ? raw.labelFallback.filter((v): v is string => typeof v === "string")
          : [];
        for (const key of fallback) {
          if (!itemProps.some((p) => p.key === key)) {
            add(`${basePath}.labelFallback`, `champ fallback absent : ${key}`);
          }
        }
        collections.push({
          param,
          label,
          itemKey,
          ...(itemLabel === undefined || itemLabel === "" ? {} : { itemLabel }),
          ...(itemKind === undefined || itemKind === "" ? {} : { itemKind }),
          ...(fallback.length === 0 ? {} : { labelFallback: fallback }),
        });
      });
    }
  }

  const dynamicRegions: TemplateEditorDynamicRegion[] = [];
  const dynamicPrefixes = new Set<string>();
  if (input.dynamicRegions !== undefined) {
    if (!Array.isArray(input.dynamicRegions)) {
      add("editor.dynamicRegions", "liste dynamicRegions attendue");
    } else {
      for (const [index, raw] of input.dynamicRegions.entries()) {
        const basePath = `editor.dynamicRegions[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet dynamicRegion attendu");
          continue;
        }
        const idPattern = text(raw.idPattern);
        const collection = text(raw.collection);
        const keyField = text(raw.keyField);
        if (!/^[a-z][a-z0-9_-]*:\{[a-z][a-z0-9_]*\}$/.test(idPattern)) {
          add(`${basePath}.idPattern`, "motif attendu : prefix:{key}");
        }
        const prefix = idPattern.slice(0, idPattern.indexOf("{"));
        if (prefix !== "") {
          if (dynamicPrefixes.has(prefix)) {
            add(`${basePath}.idPattern`, "préfixe de région dynamique ambigu");
          }
          dynamicPrefixes.add(prefix);
        }
        if (!collectionParams.has(collection)) {
          add(`${basePath}.collection`, "collection inconnue");
        }
        const collectionMeta = collections.find((entry) => entry.param === collection);
        if (collectionMeta !== undefined && collectionMeta.itemKey !== keyField) {
          add(`${basePath}.keyField`, "keyField doit correspondre à itemKey");
        }
        dynamicRegions.push({ idPattern, collection, keyField });
      }
    }
  }

  const fields: TemplateEditorFieldRule[] = [];
  if (input.fields !== undefined) {
    if (!Array.isArray(input.fields)) {
      add("editor.fields", "liste fields attendue");
    } else {
      for (const [index, raw] of input.fields.entries()) {
        const basePath = `editor.fields[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet field attendu");
          continue;
        }
        const param = text(raw.param);
        const field = text(raw.field);
        const node = findParamNode(params, param);
        if (node === null) {
          add(`${basePath}.param`, "paramètre inexistant");
        } else if (
          node.type !== "object" &&
          !(node.type === "array" && node.items?.type === "object")
        ) {
          add(`${basePath}.param`, "objet ou collection d'objets attendu");
        }
        const itemProps = objectFieldsForParam(params, param);
        const targetField = itemProps.find((entry) => entry.key === field);
        if (field !== "" && targetField === undefined) {
          add(`${basePath}.field`, "champ absent de l'élément");
        }
        const visibleWhen = raw.visibleWhen;
        let normalizedVisibleWhen: TemplateEditorVisibleWhen | undefined;
        if (visibleWhen !== undefined) {
          if (!isRecord(visibleWhen)) {
            add(`${basePath}.visibleWhen`, "objet visibleWhen attendu");
          } else {
            const conditionField = text(visibleWhen.field);
            const conditionNode = itemProps.find((entry) => entry.key === conditionField);
            if (conditionNode === undefined) {
              add(`${basePath}.visibleWhen.field`, "champ de condition absent");
            }
            const operators = ["equals", "notEquals", "in", "notIn", "truthy", "falsy"];
            const present = operators.filter((operator) => operator in visibleWhen);
            if (present.length !== 1) {
              add(`${basePath}.visibleWhen`, "exactement un opérateur de condition requis");
            } else {
              const operator = present[0] as keyof TemplateEditorVisibleWhen;
              const conditionValue = visibleWhen[operator];
              if (operator === "equals" || operator === "notEquals") {
                if (
                  !isScalarValue(conditionValue) ||
                  conditionNode === undefined ||
                  !scalarMatchesField(conditionNode, conditionValue)
                ) {
                  add(`${basePath}.visibleWhen.${operator}`, "valeur incompatible avec le champ");
                }
              } else if (operator === "in" || operator === "notIn") {
                if (
                  !Array.isArray(conditionValue) ||
                  conditionValue.length === 0 ||
                  conditionValue.some((entry) => !isScalarValue(entry)) ||
                  (conditionNode !== undefined &&
                    conditionValue.some((entry) => !scalarMatchesField(conditionNode, entry)))
                ) {
                  add(`${basePath}.visibleWhen.${operator}`, "liste de valeurs compatible requise");
                }
              } else if (conditionValue !== true) {
                add(`${basePath}.visibleWhen.${operator}`, "true attendu");
              } else if (conditionNode !== undefined && conditionNode.type !== "boolean") {
                add(`${basePath}.visibleWhen.${operator}`, "champ booléen attendu");
              }
              if (conditionNode !== undefined) {
                normalizedVisibleWhen = {
                  field: conditionField,
                  [operator]: conditionValue,
                } as TemplateEditorVisibleWhen;
              }
            }
          }
        }
        fields.push({
          param,
          field,
          ...(normalizedVisibleWhen === undefined ? {} : { visibleWhen: normalizedVisibleWhen }),
        });
      }
    }
  }

  const groups: TemplateEditorGroup[] = [];
  if (input.groups !== undefined) {
    if (!Array.isArray(input.groups)) {
      add("editor.groups", "liste groups attendue");
    } else {
      const groupIds = new Set<string>();
      for (const [index, raw] of input.groups.entries()) {
        const basePath = `editor.groups[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet groupe attendu");
          continue;
        }
        const param = text(raw.param);
        const id = text(raw.id);
        const label = text(raw.label);
        const itemProps = objectFieldsForParam(params, param);
        const node = findParamNode(params, param);
        if (node === null) {
          add(`${basePath}.param`, "paramètre inexistant");
        } else if (
          node.type !== "object" &&
          !(node.type === "array" && node.items?.type === "object")
        ) {
          add(`${basePath}.param`, "objet ou collection d'objets attendu");
        }
        if (!ID.test(id)) add(`${basePath}.id`, "id de groupe invalide");
        if (label === "") add(`${basePath}.label`, "libellé requis");
        const key = `${param}\u0000${id}`;
        if (groupIds.has(key)) add(`${basePath}.id`, "groupe dupliqué pour cette collection");
        groupIds.add(key);
        const rawFields = raw.fields;
        const groupFields: string[] = [];
        if (!Array.isArray(rawFields) || rawFields.length === 0) {
          add(`${basePath}.fields`, "liste de champs non vide attendue");
        } else {
          const seenFields = new Set<string>();
          for (const [fieldIndex, entry] of rawFields.entries()) {
            const field = text(entry);
            if (field === "" || !itemProps.some((property) => property.key === field)) {
              add(`${basePath}.fields[${fieldIndex}]`, "champ absent de l'élément");
            }
            if (seenFields.has(field)) {
              add(`${basePath}.fields[${fieldIndex}]`, "champ dupliqué");
            }
            seenFields.add(field);
            groupFields.push(field);
          }
        }
        const collapsed = raw.collapsedByDefault;
        if (collapsed !== undefined && typeof collapsed !== "boolean") {
          add(`${basePath}.collapsedByDefault`, "booléen attendu");
        }
        groups.push({
          param,
          id,
          label,
          fields: groupFields,
          ...(typeof collapsed === "boolean" ? { collapsedByDefault: collapsed } : {}),
        });
      }
    }
  }

  const valueLabels: NonNullable<TemplateEditorManifestV2["valueLabels"]> = {};
  if (input.valueLabels !== undefined) {
    if (!isRecord(input.valueLabels)) {
      add("editor.valueLabels", "objet valueLabels attendu");
    } else {
      for (const [param, rawFields] of Object.entries(input.valueLabels)) {
        const node = findParamNode(params, param);
        if (node === null) {
          add(`editor.valueLabels.${param}`, "paramètre inexistant");
          continue;
        }
        if (node.type !== "object" && !(node.type === "array" && node.items?.type === "object")) {
          add(`editor.valueLabels.${param}`, "objet ou collection d'objets attendu");
          continue;
        }
        if (!isRecord(rawFields)) {
          add(`editor.valueLabels.${param}`, "objet de champs attendu");
          continue;
        }
        const itemProps = objectFieldsForParam(params, param);
        const fieldsStore: Record<string, Record<string, string>> = {};
        for (const [field, rawLabels] of Object.entries(rawFields)) {
          if (!itemProps.some((property) => property.key === field)) {
            add(`editor.valueLabels.${param}.${field}`, "champ absent de l'élément");
            continue;
          }
          if (!isRecord(rawLabels)) {
            add(`editor.valueLabels.${param}.${field}`, "objet de libellés attendu");
            continue;
          }
          const labels: Record<string, string> = {};
          for (const [value, rawLabel] of Object.entries(rawLabels)) {
            if (FORBIDDEN_KEYS.has(value)) {
              add(`editor.valueLabels.${param}.${field}`, "clé de valeur interdite");
              continue;
            }
            const label = text(rawLabel);
            if (label === "" || label.length > 80) {
              add(`editor.valueLabels.${param}.${field}.${value}`, "libellé 1..80 caractères");
              continue;
            }
            labels[value] = label;
          }
          fieldsStore[field] = labels;
        }
        valueLabels[param] = fieldsStore;
      }
    }
  }

  const references: TemplateEditorReference[] = [];
  if (input.references !== undefined) {
    if (!Array.isArray(input.references)) {
      add("editor.references", "liste references attendue");
    } else {
      for (const [index, raw] of input.references.entries()) {
        const basePath = `editor.references[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet référence attendu");
          continue;
        }
        const from = text(raw.from);
        const field = text(raw.field);
        const targetKey = text(raw.targetKey);
        const fromProps = objectFieldsForParam(params, from);
        if (!collectionParams.has(from)) add(`${basePath}.from`, "collection inconnue");
        if (field === "" || !fromProps.some((property) => property.key === field)) {
          add(`${basePath}.field`, "champ absent de la collection source");
        }
        const rawTo = raw.to;
        const rawTargets = raw.targets;
        const targets: Record<string, string> = {};
        if (rawTo !== undefined && rawTargets !== undefined) {
          add(basePath, "to et targets sont exclusifs");
        } else if (rawTo !== undefined) {
          const to = text(rawTo);
          if (!collectionParams.has(to)) add(`${basePath}.to`, "collection cible inconnue");
          targets.target = to;
        } else if (rawTargets !== undefined) {
          if (!isRecord(rawTargets)) {
            add(`${basePath}.targets`, "objet targets attendu");
          } else {
            for (const [kind, value] of Object.entries(rawTargets)) {
              const target = text(value);
              if (kind === "" || FORBIDDEN_KEYS.has(kind)) {
                add(`${basePath}.targets`, "clé de discriminant invalide");
                continue;
              }
              if (!collectionParams.has(target)) {
                add(`${basePath}.targets.${kind}`, "collection cible inconnue");
              }
              targets[kind] = target;
            }
          }
          const discriminator = text(raw.discriminator);
          if (
            discriminator === "" ||
            !fromProps.some((property) => property.key === discriminator)
          ) {
            add(`${basePath}.discriminator`, "champ discriminant requis dans la collection source");
          }
        } else {
          add(basePath, "to ou targets requis");
        }
        for (const [kind, target] of Object.entries(targets)) {
          const targetProps = objectFieldsForParam(params, target);
          if (targetKey === "" || !targetProps.some((property) => property.key === targetKey)) {
            add(`${basePath}.targetKey`, `clé cible absente (${kind})`);
          }
        }
        const optional = raw.optional;
        if (optional !== undefined && typeof optional !== "boolean") {
          add(`${basePath}.optional`, "booléen attendu");
        }
        const onDelete = raw.onDelete;
        if (
          onDelete !== undefined &&
          onDelete !== "clear" &&
          onDelete !== "cascade" &&
          onDelete !== "restrict"
        ) {
          add(`${basePath}.onDelete`, "clear, cascade ou restrict attendu");
        }
        references.push({
          from,
          field,
          ...(rawTo === undefined ? {} : { to: text(rawTo) }),
          ...(rawTargets === undefined ? {} : { targets }),
          ...(raw.discriminator === undefined ? {} : { discriminator: text(raw.discriminator) }),
          targetKey,
          ...(typeof optional === "boolean" ? { optional } : {}),
          ...(onDelete === undefined
            ? {}
            : { onDelete: onDelete as "clear" | "cascade" | "restrict" }),
        });
      }
    }
  }

  let structure: TemplateEditorStructure | undefined;
  if (input.structure !== undefined) {
    if (!isRecord(input.structure)) {
      add("editor.structure", "objet structure attendu");
    } else {
      const roots = text(input.structure.roots);
      if (!collectionParams.has(roots)) add("editor.structure.roots", "collection inconnue");
      let regionsStructure: TemplateEditorStructure["regions"];
      const rawRegions = input.structure.regions;
      if (rawRegions !== undefined) {
        if (!isRecord(rawRegions)) {
          add("editor.structure.regions", "objet regions attendu");
        } else {
          const collection = text(rawRegions.collection);
          if (!collectionParams.has(collection)) {
            add("editor.structure.regions.collection", "collection inconnue");
          }
          // Les champs structurels (header_id, footer_id…) appartiennent à la
          // collection racine et référencent la collection des régions.
          const rootProps = objectFieldsForParam(params, roots);
          const rawFields = rawRegions.fields;
          const structureFields: string[] = [];
          if (!Array.isArray(rawFields)) {
            add("editor.structure.regions.fields", "liste de champs attendue");
          } else {
            const seen = new Set<string>();
            for (const [fieldIndex, entry] of rawFields.entries()) {
              const field = text(entry);
              if (!rootProps.some((property) => property.key === field)) {
                add(`editor.structure.regions.fields[${fieldIndex}]`, "champ absent de la racine");
              }
              const linked = references.some(
                (reference) =>
                  reference.from === roots &&
                  reference.field === field &&
                  (reference.to === collection ||
                    Object.values(reference.targets ?? {}).includes(collection)),
              );
              if (!linked) {
                add(
                  `editor.structure.regions.fields[${fieldIndex}]`,
                  "référence vers la collection des régions requise",
                );
              }
              if (seen.has(field))
                add(`editor.structure.regions.fields[${fieldIndex}]`, "champ dupliqué");
              seen.add(field);
              structureFields.push(field);
            }
          }
          regionsStructure = { collection, fields: structureFields };
        }
      }
      let children: TemplateEditorStructure["children"];
      const rawChildren = input.structure.children;
      if (rawChildren !== undefined) {
        if (!isRecord(rawChildren)) {
          add("editor.structure.children", "objet children attendu");
        } else {
          const collection = text(rawChildren.collection);
          const through = text(rawChildren.through);
          if (!collectionParams.has(collection))
            add("editor.structure.children.collection", "collection inconnue");
          if (!collectionParams.has(through))
            add("editor.structure.children.through", "collection inconnue");
          if (!collections.some((entry) => entry.param === collection)) {
            add(
              "editor.structure.children.collection",
              "métadonnées de collection enfant requises",
            );
          }
          if (!collections.some((entry) => entry.param === through)) {
            add(
              "editor.structure.children.through",
              "métadonnées de collection de placements requises",
            );
          }
          const throughProps = objectFieldsForParam(params, through);
          const requiredFields = ["parentKey", "childKey"] as const;
          const optionalFields = ["parentKindKey", "orderKey", "slotKey"] as const;
          for (const key of requiredFields) {
            const value = text(rawChildren[key]);
            if (value === "" || !throughProps.some((property) => property.key === value)) {
              add(`editor.structure.children.${key}`, "champ absent de la collection through");
            }
          }
          for (const key of optionalFields) {
            if (rawChildren[key] !== undefined) {
              const value = text(rawChildren[key]);
              if (!throughProps.some((property) => property.key === value)) {
                add(`editor.structure.children.${key}`, "champ absent de la collection through");
              }
            }
          }
          children = {
            collection,
            through,
            parentKey: text(rawChildren.parentKey),
            childKey: text(rawChildren.childKey),
            ...(rawChildren.parentKindKey === undefined
              ? {}
              : { parentKindKey: text(rawChildren.parentKindKey) }),
            ...(rawChildren.orderKey === undefined ? {} : { orderKey: text(rawChildren.orderKey) }),
            ...(rawChildren.slotKey === undefined ? {} : { slotKey: text(rawChildren.slotKey) }),
          };
        }
      }
      structure = {
        roots,
        ...(regionsStructure === undefined ? {} : { regions: regionsStructure }),
        ...(children === undefined ? {} : { children }),
      };
    }
  }

  const scopes: TemplateEditorScope[] = [];
  if (input.scopes !== undefined) {
    if (!Array.isArray(input.scopes)) {
      add("editor.scopes", "liste scopes attendue");
    } else {
      const seen = new Set<string>();
      for (const [index, raw] of input.scopes.entries()) {
        const basePath = `editor.scopes[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet scope attendu");
          continue;
        }
        const param = text(raw.param);
        if (findParamNode(params, param) === null) add(`${basePath}.param`, "paramètre inexistant");
        if (seen.has(param)) add(`${basePath}.param`, "scope dupliqué");
        seen.add(param);
        const scope = text(raw.scope);
        if (!["global", "shared", "page", "local"].includes(scope)) {
          add(`${basePath}.scope`, "global, shared, page ou local attendu");
        }
        scopes.push({ param, scope: scope as TemplateEditorScope["scope"] });
      }
    }
  }

  const insertion: TemplateEditorInsertionRule[] = [];
  if (input.insertion !== undefined) {
    if (!Array.isArray(input.insertion)) {
      add("editor.insertion", "liste insertion attendue");
    } else {
      const seenRules = new Set<string>();
      for (const [index, raw] of input.insertion.entries()) {
        const basePath = `editor.insertion[${index}]`;
        if (!isRecord(raw)) {
          add(basePath, "objet insertion attendu");
          continue;
        }
        const parentKind = text(raw.parentKind);
        const childCollection = text(raw.childCollection);
        const slot = text(raw.slot);
        if (parentKind === "") add(`${basePath}.parentKind`, "parentKind requis");
        if (!collectionParams.has(childCollection)) {
          add(`${basePath}.childCollection`, "collection enfant inconnue");
        }
        if (slot === "") add(`${basePath}.slot`, "slot requis");
        const ruleKey = `${parentKind}\u0000${childCollection}`;
        if (seenRules.has(ruleKey)) add(basePath, "règle d'insertion dupliquée");
        seenRules.add(ruleKey);
        const rawKinds = raw.allowedKinds;
        const allowedKinds: string[] = [];
        if (!Array.isArray(rawKinds) || rawKinds.length === 0) {
          add(`${basePath}.allowedKinds`, "liste de types non vide attendue");
        } else {
          const seenKinds = new Set<string>();
          for (const [kindIndex, entry] of rawKinds.entries()) {
            const kind = text(entry);
            if (kind === "") add(`${basePath}.allowedKinds[${kindIndex}]`, "type vide");
            if (seenKinds.has(kind)) {
              add(`${basePath}.allowedKinds[${kindIndex}]`, "type dupliqué");
            }
            seenKinds.add(kind);
            allowedKinds.push(kind);
          }
        }
        const maxItems = raw.maxItems;
        if (
          maxItems !== undefined &&
          (typeof maxItems !== "number" || !Number.isInteger(maxItems) || maxItems < 1)
        ) {
          add(`${basePath}.maxItems`, "entier positif attendu");
        }
        const defaults: Record<string, Record<string, TemplateParamValue>> = {};
        if (raw.defaults !== undefined) {
          if (!isRecord(raw.defaults)) {
            add(`${basePath}.defaults`, "objet defaults attendu");
          } else {
            for (const [kind, rawDefault] of Object.entries(raw.defaults)) {
              if (!allowedKinds.includes(kind)) {
                add(`${basePath}.defaults.${kind}`, "type absent de allowedKinds");
                continue;
              }
              if (!isRecord(rawDefault)) {
                add(`${basePath}.defaults.${kind}`, "objet de valeurs attendu");
                continue;
              }
              defaults[kind] = JSON.parse(JSON.stringify(rawDefault)) as Record<
                string,
                TemplateParamValue
              >;
            }
          }
        }
        insertion.push({
          parentKind,
          childCollection,
          allowedKinds,
          slot,
          ...(typeof maxItems === "number" ? { maxItems } : {}),
          ...(Object.keys(defaults).length === 0 ? {} : { defaults }),
        });
      }
    }
  }

  const rawBaseBindings = Array.isArray(input.bindings) ? input.bindings : [];
  const v2Bindings = base.value.bindings.map((binding, index) => {
    const raw = rawBaseBindings[index];
    if (!isRecord(raw)) return binding;
    const itemKey = raw.itemKey === undefined ? undefined : text(raw.itemKey);
    const itemId = raw.itemId === undefined ? undefined : text(raw.itemId);
    const collection = collections.find((entry) => entry.param === binding.param);
    if (itemKey !== undefined && itemKey !== "" && !collectionParams.has(binding.param)) {
      add(`editor.bindings[${index}].itemKey`, "binding d'élément sur une collection inconnue");
    }
    if (itemId !== undefined && itemId !== "") {
      if (itemKey === undefined || itemKey === "") {
        add(`editor.bindings[${index}].itemKey`, "itemKey requis avec itemId");
      } else if (collection !== undefined && collection.itemKey !== itemKey) {
        add(`editor.bindings[${index}].itemKey`, "itemKey doit correspondre à la collection");
      }
      const dynamic = dynamicRegions.some(
        (entry) => entry.collection === binding.param && entry.keyField === itemKey,
      );
      if (!dynamic) {
        add(`editor.bindings[${index}].itemId`, "région dynamique absente pour cet élément");
      }
    }
    if (itemId !== undefined && itemId === "") {
      add(`editor.bindings[${index}].itemId`, "itemId vide");
    }
    return {
      ...binding,
      ...(itemKey === undefined || itemKey === "" ? {} : { itemKey }),
      ...(itemId === undefined ? {} : { itemId }),
    };
  });

  return errors.length > 0
    ? { ok: false, errors }
    : {
        ok: true,
        value: {
          ...base.value,
          version: 2,
          bindings: v2Bindings,
          ...(collections.length === 0 ? {} : { collections }),
          ...(dynamicRegions.length === 0 ? {} : { dynamicRegions }),
          ...(fields.length === 0 ? {} : { fields }),
          ...(groups.length === 0 ? {} : { groups }),
          ...(Object.keys(valueLabels).length === 0 ? {} : { valueLabels }),
          ...(references.length === 0 ? {} : { references }),
          ...(structure === undefined ? {} : { structure }),
          ...(insertion.length === 0 ? {} : { insertion }),
          ...(scopes.length === 0 ? {} : { scopes }),
        },
      };
}

/** Résout `block:hero_main` vers la collection et l’élément stable. */
export function resolveDynamicRegion(
  editor: TemplateEditorManifest,
  regionId: string,
): TemplateEditorResolvedRegion | null {
  if (editor.version !== 2) return null;
  for (const definition of editor.dynamicRegions ?? []) {
    const open = definition.idPattern.indexOf("{");
    const close = definition.idPattern.indexOf("}", open + 1);
    if (open < 0 || close < 0) continue;
    const prefix = definition.idPattern.slice(0, open);
    const suffix = definition.idPattern.slice(close + 1);
    if (!regionId.startsWith(prefix) || !regionId.endsWith(suffix)) continue;
    const itemId = regionId.slice(prefix.length, regionId.length - suffix.length);
    if (itemId === "") continue;
    const collection = editor.collections?.find((entry) => entry.param === definition.collection);
    return {
      regionId,
      collection: definition.collection,
      keyField: definition.keyField,
      itemId,
      collectionLabel: collection?.label ?? definition.collection,
    };
  }
  return null;
}

/**
 * Résout une région dynamique contre les valeurs réelles.
 * Retourne `null` si la collection n'existe pas, si l'élément est absent
 * ou si plusieurs éléments partagent le même identifiant stable.
 */
export function resolveDynamicRegionItem(
  editor: TemplateEditorManifest,
  regionId: string,
  values: TemplateParamValues,
): TemplateEditorRegionItem | null {
  const target = resolveDynamicRegion(editor, regionId);
  if (target === null) return null;
  const raw = values[target.collection];
  if (!Array.isArray(raw)) return null;
  const matches: { item: Record<string, TemplateParamValue>; index: number }[] = [];
  raw.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    if (entry[target.keyField] !== target.itemId) return;
    matches.push({ item: entry as Record<string, TemplateParamValue>, index });
  });
  if (matches.length !== 1) return null;
  const match = matches[0];
  if (match === undefined) return null;
  return { ...target, item: match.item, index: match.index };
}

/** Vérifie l'unicité des identifiants d'éléments avant persistance. */
export function validateTemplateEditorCollectionValues(
  editor: TemplateEditorManifest,
  values: TemplateParamValues,
): TemplateEditorError[] {
  if (editor.version !== 2) return [];
  const errors: TemplateEditorError[] = [];
  for (const collection of editor.collections ?? []) {
    const raw = values[collection.param];
    if (raw === undefined) continue;
    if (!Array.isArray(raw)) {
      errors.push({
        field: `values.${collection.param}`,
        message: "collection attendue sous forme de tableau",
      });
      continue;
    }
    const seen = new Set<string>();
    raw.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push({
          field: `values.${collection.param}[${index}]`,
          message: "élément de collection attendu sous forme d'objet",
        });
        return;
      }
      const id = entry[collection.itemKey];
      if (typeof id !== "string" || id.trim() === "") {
        errors.push({
          field: `values.${collection.param}[${index}].${collection.itemKey}`,
          message: "identifiant stable non vide requis",
        });
        return;
      }
      if (seen.has(id)) {
        errors.push({
          field: `values.${collection.param}[${index}].${collection.itemKey}`,
          message: `identifiant dupliqué : ${id}`,
        });
      }
      seen.add(id);
    });
  }
  return errors;
}

/** Détecte les cycles réels de contenance déclarés par `structure.children`. */
export function validateTemplateEditorStructureValues(
  editor: TemplateEditorManifest,
  values: TemplateParamValues,
): TemplateEditorError[] {
  if (editor.version !== 2 || editor.structure?.children === undefined) return [];
  const children = editor.structure.children;
  const errors: TemplateEditorError[] = [];
  const collectionMeta = (param: string) =>
    editor.collections?.find((collection) => collection.param === param);
  const childMeta = collectionMeta(children.collection);
  const throughMeta = collectionMeta(children.through);
  if (childMeta === undefined) {
    errors.push({
      field: "editor.structure.children.collection",
      message: "collection enfant sans métadonnées itemKey",
    });
  }
  if (throughMeta === undefined) {
    errors.push({
      field: "editor.structure.children.through",
      message: "collection de placements sans métadonnées itemKey",
    });
  }

  const rawChildren = values[children.collection];
  const childIds = new Set<string>();
  if (Array.isArray(rawChildren) && childMeta !== undefined) {
    rawChildren.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push({
          field: `values.${children.collection}[${index}]`,
          message: "élément de collection attendu sous forme d'objet",
        });
        return;
      }
      const id = entry[childMeta.itemKey];
      if (typeof id !== "string" || id === "") {
        errors.push({
          field: `values.${children.collection}[${index}].${childMeta.itemKey}`,
          message: "identifiant stable non vide requis",
        });
        return;
      }
      if (childIds.has(id)) {
        errors.push({
          field: `values.${children.collection}[${index}].${childMeta.itemKey}`,
          message: `identifiant dupliqué : ${id}`,
        });
      }
      childIds.add(id);
    });
  } else if (rawChildren !== undefined) {
    errors.push({
      field: `values.${children.collection}`,
      message: "collection enfant attendue sous forme de tableau",
    });
  }

  const parentKinds = new Map<string, string>();
  if (children.parentKindKey !== undefined) {
    const reference = editor.references?.find(
      (entry) =>
        entry.from === children.through &&
        entry.field === children.parentKey &&
        entry.discriminator === children.parentKindKey,
    );
    const targets = reference?.targets;
    if (targets === undefined || Object.keys(targets).length === 0) {
      errors.push({
        field: "editor.structure.children.parentKindKey",
        message: "référence polymorphe déclarée requise pour résoudre parent_kind",
      });
    } else {
      for (const [kind, collection] of Object.entries(targets)) parentKinds.set(kind, collection);
    }
  }

  const rawPlacements = values[children.through];
  if (rawPlacements === undefined) return errors;
  if (!Array.isArray(rawPlacements)) {
    errors.push({
      field: `values.${children.through}`,
      message: "collection de placements attendue sous forme de tableau",
    });
    return errors;
  }
  const placementIds = new Set<string>();
  const placedChildren = new Set<string>();
  const graph = new Map<string, Set<string>>();
  const parentExists = (collection: string, id: string): boolean => {
    const meta = collectionMeta(collection);
    if (meta === undefined) {
      errors.push({
        field: `editor.structure.children.parentKindKey`,
        message: `collection parent sans métadonnées itemKey : ${collection}`,
      });
      return false;
    }
    const items = values[collection];
    if (!Array.isArray(items)) {
      errors.push({
        field: `values.${collection}`,
        message: "collection parent absente",
      });
      return false;
    }
    return items.some((entry) => isRecord(entry) && entry[meta.itemKey] === id);
  };

  rawPlacements.forEach((entry, index) => {
    if (!isRecord(entry)) {
      errors.push({
        field: `values.${children.through}[${index}]`,
        message: "placement attendu sous forme d'objet",
      });
      return;
    }
    if (throughMeta !== undefined) {
      const placementId = entry[throughMeta.itemKey];
      if (typeof placementId !== "string" || placementId === "") {
        errors.push({
          field: `values.${children.through}[${index}].${throughMeta.itemKey}`,
          message: "identifiant de placement non vide requis",
        });
      } else {
        if (placementIds.has(placementId)) {
          errors.push({
            field: `values.${children.through}[${index}].${throughMeta.itemKey}`,
            message: `placement dupliqué : ${placementId}`,
          });
        }
        placementIds.add(placementId);
      }
    }

    const childId = entry[children.childKey];
    if (typeof childId !== "string" || childId === "") {
      errors.push({
        field: `values.${children.through}[${index}].${children.childKey}`,
        message: "childKey non vide requis",
      });
      return;
    }
    if (!childIds.has(childId)) {
      errors.push({
        field: `values.${children.through}[${index}].${children.childKey}`,
        message: `enfant inexistant dans ${children.collection}`,
      });
    }
    if (placedChildren.has(childId)) {
      errors.push({
        field: `values.${children.through}[${index}].${children.childKey}`,
        message: `enfant placé plusieurs fois : ${childId}`,
      });
    }
    placedChildren.add(childId);

    const parentId = entry[children.parentKey];
    if (typeof parentId !== "string" || parentId === "") {
      errors.push({
        field: `values.${children.through}[${index}].${children.parentKey}`,
        message: "parentKey non vide requis",
      });
      return;
    }
    let parentCollection = children.collection;
    if (children.parentKindKey !== undefined) {
      const parentKind = entry[children.parentKindKey];
      if (typeof parentKind !== "string" || !parentKinds.has(parentKind)) {
        errors.push({
          field: `values.${children.through}[${index}].${children.parentKindKey}`,
          message: "parent_kind non déclaré dans les références",
        });
        return;
      }
      parentCollection = parentKinds.get(parentKind) as string;
    }
    if (!parentExists(parentCollection, parentId)) {
      errors.push({
        field: `values.${children.through}[${index}].${children.parentKey}`,
        message: `parent inexistant dans ${parentCollection}`,
      });
    }
    if (parentCollection === children.collection) {
      const edges = graph.get(parentId) ?? new Set<string>();
      edges.add(childId);
      graph.set(parentId, edges);
    }
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (node: string): boolean => {
    if (visiting.has(node)) return true;
    if (visited.has(node)) return false;
    visiting.add(node);
    for (const child of graph.get(node) ?? []) {
      if (visit(child)) return true;
    }
    visiting.delete(node);
    visited.add(node);
    return false;
  };
  for (const node of graph.keys()) {
    if (visit(node)) {
      errors.push({
        field: "editor.structure.children",
        message: "cycle de contenance réel détecté entre composants",
      });
      break;
    }
  }
  return errors;
}

/** Vrai si le paramètre est rattaché à plusieurs zones. */
export function isTemplateEditorBindingShared(binding: TemplateEditorBinding): boolean {
  return binding.regions.length > 1;
}

/** Paramètres visibles pour une zone. */
export function bindingsForRegion(
  editor: TemplateEditorManifest,
  regionId: string,
): TemplateEditorBinding[] {
  const dynamic = resolveDynamicRegion(editor, regionId);
  return editor.bindings.filter((binding) => {
    const v2 = binding as TemplateEditorBindingV2;
    if (dynamic === null) return binding.regions.includes(regionId);
    const sameItem =
      v2.itemId === undefined ||
      (v2.itemId === dynamic.itemId &&
        (v2.itemKey === undefined || v2.itemKey === dynamic.keyField));
    if (!sameItem) return false;
    if (binding.regions.includes(regionId)) return true;
    return (
      v2.param === dynamic.collection &&
      (v2.itemKey === undefined || v2.itemKey === dynamic.keyField)
    );
  });
}

/** Toutes les zones affectées par un binding, y compris les parents. */
export function editorRegionChain(
  editor: TemplateEditorManifest,
  regionId: string,
): TemplateEditorRegion[] {
  const byId = new Map(editor.regions.map((region) => [region.id, region]));
  const chain: TemplateEditorRegion[] = [];
  const seen = new Set<string>();
  let current = byId.get(regionId);
  while (current !== undefined && !seen.has(current.id)) {
    seen.add(current.id);
    chain.unshift(current);
    current = current.parent === undefined ? undefined : byId.get(current.parent);
  }
  return chain;
}
