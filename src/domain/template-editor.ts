/**
 * Contrat d’édition des templates visuels (ADR-0105).
 *
 * Le cœur ne connaît aucune zone métier : un template déclare des régions
 * sélectionnables et les paramètres qui leur sont rattachés. Ce module valide
 * cette déclaration contre le schéma de paramètres de la version.
 */

import type { TemplateParamNode, TemplateParamSchema } from "./template-params";

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
        if (!collectionParams.has(param)) add(`${basePath}.param`, "collection inconnue");
        const itemNode = findParamNode(params, param)?.items;
        const itemProps = itemNode?.type === "object" ? (itemNode.properties ?? []) : [];
        if (field !== "" && !itemProps.some((p) => p.key === field)) {
          add(`${basePath}.field`, "champ absent de l'élément");
        }
        const visibleWhen = raw.visibleWhen;
        if (visibleWhen !== undefined) {
          if (!isRecord(visibleWhen)) add(`${basePath}.visibleWhen`, "objet visibleWhen attendu");
          else {
            const conditionField = text(visibleWhen.field);
            if (!itemProps.some((p) => p.key === conditionField)) {
              add(`${basePath}.visibleWhen.field`, "champ de condition absent");
            }
            const operators = ["equals", "notEquals", "in", "notIn", "truthy", "falsy"];
            if (!operators.some((op) => op in visibleWhen)) {
              add(`${basePath}.visibleWhen`, "opérateur de condition requis");
            }
          }
        }
        fields.push({
          param,
          field,
          ...(raw.visibleWhen === undefined
            ? {}
            : { visibleWhen: raw.visibleWhen as TemplateEditorVisibleWhen }),
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
          ...(input.groups === undefined ? {} : { groups: input.groups as TemplateEditorGroup[] }),
          ...(input.valueLabels === undefined
            ? {}
            : {
                valueLabels: input.valueLabels as NonNullable<
                  TemplateEditorManifestV2["valueLabels"]
                >,
              }),
          ...(input.references === undefined
            ? {}
            : { references: input.references as TemplateEditorReference[] }),
          ...(input.structure === undefined
            ? {}
            : { structure: input.structure as TemplateEditorStructure }),
          ...(input.scopes === undefined ? {} : { scopes: input.scopes as TemplateEditorScope[] }),
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
