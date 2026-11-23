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

export type TemplateEditorManifest = {
  version: 1;
  regions: TemplateEditorRegion[];
  bindings: TemplateEditorBinding[];
};

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
export function validateTemplateEditorBlock(
  input: unknown,
  params: TemplateParamSchema[],
): TemplateEditorValidation {
  if (input === undefined) return { ok: true, value: undefined };
  if (!isRecord(input)) {
    return { ok: false, errors: [{ field: "editor", message: "objet editor attendu" }] };
  }

  const errors: TemplateEditorError[] = [];
  const add = (field: string, message: string): void => {
    errors.push({ field, message });
  };

  if (input.version !== EDITOR_VERSION) {
    add("editor.version", `version doit valoir ${EDITOR_VERSION}`);
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
      if (paramsSeen.has(param)) add(`${base}.param`, "binding dupliqué");
      paramsSeen.add(param);

      const rawRegionsForBinding = raw.regions;
      const bindingRegions = Array.isArray(rawRegionsForBinding)
        ? rawRegionsForBinding.filter((entry): entry is string => typeof entry === "string")
        : [];
      if (bindingRegions.length === 0) add(`${base}.regions`, "au moins une région");
      for (const regionId of bindingRegions) {
        if (!regionIds.has(regionId)) add(`${base}.regions`, `région inconnue : ${regionId}`);
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

/** Vrai si le paramètre est rattaché à plusieurs zones. */
export function isTemplateEditorBindingShared(binding: TemplateEditorBinding): boolean {
  return binding.regions.length > 1;
}

/** Paramètres visibles pour une zone. */
export function bindingsForRegion(
  editor: TemplateEditorManifest,
  regionId: string,
): TemplateEditorBinding[] {
  return editor.bindings.filter((binding) => binding.regions.includes(regionId));
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
