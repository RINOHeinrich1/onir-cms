import type { TemplateEditorCollection, TemplateEditorManifest } from "./template-editor";
import type { TemplateParamValue, TemplateParamValues } from "./template-params";

export type TemplateStructureScope =
  | { kind: "page"; pageId: string }
  | {
      kind: "shared";
      reason: "header" | "footer" | "region" | "scope";
      pageIds: string[];
    }
  | { kind: "global" }
  | { kind: "unknown" };

export type TemplateStructureItem = {
  collection: string;
  itemId: string;
  kind: string;
  scope: TemplateStructureScope;
};

export type TemplateStructureIndex = {
  get: (collection: string, itemId: string) => TemplateStructureItem | null;
};

type RegionInfo = {
  pageIds: Set<string>;
  reason: "header" | "footer" | "region";
};

function isRecord(value: unknown): value is Record<string, TemplateParamValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function scalar(value: TemplateParamValue | undefined): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function collectionKindMatches(kind: string, collection: string): boolean {
  const normalizedKind = normalize(kind);
  const normalizedCollection = normalize(collection);
  return (
    normalizedKind === normalizedCollection ||
    normalizedKind === normalizedCollection.replace(/ies$/, "y") ||
    normalizedKind === normalizedCollection.replace(/s$/, "")
  );
}

function collectionByParam(editor: TemplateEditorManifest): Map<string, TemplateEditorCollection> {
  if (editor.version !== 2) return new Map();
  return new Map((editor.collections ?? []).map((collection) => [collection.param, collection]));
}

function itemIds(values: TemplateParamValues, collection: string, key: string): Set<string> {
  const raw = values[collection];
  const ids = new Set<string>();
  if (!Array.isArray(raw)) return ids;
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const id = scalar(entry[key]);
    if (id !== "") ids.add(id);
  }
  return ids;
}

function declaredScope(editor: TemplateEditorManifest, collection: string): TemplateStructureScope {
  if (editor.version !== 2) return { kind: "unknown" };
  const declared = editor.scopes?.find((entry) => entry.param === collection);
  if (declared?.scope === "global") return { kind: "global" };
  if (declared?.scope === "shared") {
    return { kind: "shared", reason: "scope", pageIds: [] };
  }
  return { kind: "unknown" };
}

export function structureItemKey(collection: string, itemId: string): string {
  return `${collection}:${itemId}`;
}

export function buildTemplateStructureIndex(
  editor: TemplateEditorManifest,
  values: TemplateParamValues,
): TemplateStructureIndex {
  const items = new Map<string, TemplateStructureItem>();
  if (editor.version !== 2) {
    return { get: () => null };
  }

  const collections = collectionByParam(editor);
  const rootCollection = editor.structure?.roots;
  const children = editor.structure?.children;
  const regions = editor.structure?.regions;
  const rootMeta = rootCollection === undefined ? undefined : collections.get(rootCollection);
  const rootKey = rootMeta?.itemKey ?? "id";

  const rootIds =
    rootCollection === undefined ? new Set<string>() : itemIds(values, rootCollection, rootKey);
  const childIds =
    children === undefined
      ? new Set<string>()
      : itemIds(values, children.collection, collections.get(children.collection)?.itemKey ?? "id");
  const regionIds =
    regions === undefined
      ? new Set<string>()
      : itemIds(values, regions.collection, collections.get(regions.collection)?.itemKey ?? "id");

  const placementByChild = new Map<string, Record<string, TemplateParamValue>>();
  if (children !== undefined) {
    const raw = values[children.through];
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!isRecord(entry)) continue;
        const childId = scalar(entry[children.childKey]);
        if (childId !== "") placementByChild.set(childId, entry);
      }
    }
  }

  const regionInfo = new Map<string, RegionInfo>();
  if (regions !== undefined && rootCollection !== undefined) {
    const raw = values[rootCollection];
    if (Array.isArray(raw)) {
      for (const entry of raw) {
        if (!isRecord(entry)) continue;
        const pageId = scalar(entry[rootKey]);
        if (pageId === "") continue;
        for (const field of regions.fields) {
          const regionId = scalar(entry[field]);
          if (regionId === "") continue;
          const reason = normalize(field).includes("header")
            ? "header"
            : normalize(field).includes("footer")
              ? "footer"
              : "region";
          const existing = regionInfo.get(regionId);
          if (existing === undefined) {
            regionInfo.set(regionId, { pageIds: new Set([pageId]), reason });
          } else {
            existing.pageIds.add(pageId);
          }
        }
      }
    }
  }

  const kindToCollection = (kind: string): string | null => {
    if (rootCollection !== undefined && collectionKindMatches(kind, rootCollection)) {
      return rootCollection;
    }
    if (children !== undefined && collectionKindMatches(kind, children.collection)) {
      return children.collection;
    }
    if (regions !== undefined && collectionKindMatches(kind, regions.collection)) {
      return regions.collection;
    }
    for (const collection of editor.collections ?? []) {
      if (collectionKindMatches(kind, collection.param)) return collection.param;
    }
    return null;
  };

  const regionScope = (regionId: string): TemplateStructureScope => {
    const info = regionInfo.get(regionId);
    if (info === undefined) return { kind: "unknown" };
    const pageIds = [...info.pageIds];
    if (pageIds.length === 1 && info.reason === "region" && pageIds[0] !== undefined) {
      return { kind: "page", pageId: pageIds[0] };
    }
    return { kind: "shared", reason: info.reason, pageIds };
  };

  const resolveScope = (
    collection: string,
    itemId: string,
    seen: Set<string>,
  ): TemplateStructureScope => {
    const key = structureItemKey(collection, itemId);
    if (seen.has(key)) return { kind: "unknown" };
    seen.add(key);

    if (rootCollection !== undefined && collection === rootCollection) {
      return { kind: "page", pageId: itemId };
    }
    if (regions !== undefined && collection === regions.collection) {
      return regionScope(itemId);
    }
    if (children !== undefined && collection === children.collection) {
      const placement = placementByChild.get(itemId);
      if (placement === undefined) return { kind: "unknown" };
      const parentKind = scalar(placement[children.parentKindKey ?? "parent_kind"]);
      const parentId = scalar(placement[children.parentKey]);
      if (parentKind === "" || parentId === "") return { kind: "unknown" };
      const parentCollection = kindToCollection(parentKind);
      if (parentCollection === null) return { kind: "unknown" };
      const parentExists =
        (parentCollection === rootCollection && rootIds.has(parentId)) ||
        (parentCollection === children.collection && childIds.has(parentId)) ||
        (parentCollection === regions?.collection && regionIds.has(parentId));
      if (!parentExists) return { kind: "unknown" };
      return resolveScope(parentCollection, parentId, seen);
    }
    return declaredScope(editor, collection);
  };

  for (const [collection, meta] of collections) {
    const raw = values[collection];
    if (!Array.isArray(raw)) continue;
    for (const entry of raw) {
      if (!isRecord(entry)) continue;
      const itemId = scalar(entry[meta.itemKey]);
      if (itemId === "") continue;
      const kind = meta.itemKind === undefined ? "" : scalar(entry[meta.itemKind]);
      items.set(structureItemKey(collection, itemId), {
        collection,
        itemId,
        kind,
        scope: resolveScope(collection, itemId, new Set()),
      });
    }
  }

  return {
    get: (collection, itemId) => items.get(structureItemKey(collection, itemId)) ?? null,
  };
}
