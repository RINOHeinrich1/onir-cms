import type { TemplateEditorManifest, TemplateEditorManifestV2 } from "@/domain/template-editor";
import type { TemplateParamValue, TemplateParamValues } from "@/domain/template-params";

export type TemplateStructureOperationResult = {
  values: TemplateParamValues;
  itemId: string | null;
};

type RecordValue = Record<string, TemplateParamValue>;

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function createTemplateItemId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function editorV2(editor: TemplateEditorManifest): TemplateEditorManifestV2 | null {
  return editor.version === 2 ? editor : null;
}

function collectionMeta(editor: TemplateEditorManifestV2, param: string) {
  return editor.collections?.find((collection) => collection.param === param);
}

function collectionItems(values: TemplateParamValues, param: string): RecordValue[] | null {
  const raw = values[param];
  if (!Array.isArray(raw)) return null;
  return raw.filter(isRecord);
}

function copyPlacements(
  values: TemplateParamValues,
  editor: TemplateEditorManifestV2,
  collection: string,
  anchorId: string,
  newId: string,
): TemplateParamValues {
  const children = editor.structure?.children;
  if (children === undefined || children.collection !== collection) return values;
  const placements = collectionItems(values, children.through);
  if (placements === null) return values;
  const throughMeta = collectionMeta(editor, children.through);
  const copies: RecordValue[] = [];
  for (const placement of placements) {
    if (placement[children.childKey] !== anchorId) continue;
    const copy = clone(placement);
    copy[children.childKey] = newId;
    if (throughMeta !== undefined) copy[throughMeta.itemKey] = createTemplateItemId();
    copies.push(copy);
  }
  if (copies.length === 0) return values;
  return { ...values, [children.through]: [...placements, ...copies] };
}

/** Ajoute un élément et, pour une collection structurelle, un placement ancré. */
export function addCollectionItem(
  values: TemplateParamValues,
  editor: TemplateEditorManifest,
  collection: string,
  item: RecordValue,
  anchorId?: string,
): TemplateStructureOperationResult {
  const v2 = editorV2(editor);
  const meta = v2 === null ? undefined : collectionMeta(v2, collection);
  if (v2 === null || meta === undefined) return { values, itemId: null };
  const items = collectionItems(values, collection) ?? [];
  const itemId = createTemplateItemId();
  const nextItem = { ...clone(item), [meta.itemKey]: itemId };
  let next: TemplateParamValues = { ...values, [collection]: [...items, nextItem] };
  if (anchorId !== undefined) {
    next = copyPlacements(next, v2, collection, anchorId, itemId);
  }
  return { values: next, itemId };
}

/** Duplique un élément avec une nouvelle identité et copie ses placements. */
export function duplicateCollectionItem(
  values: TemplateParamValues,
  editor: TemplateEditorManifest,
  collection: string,
  itemId: string,
): TemplateStructureOperationResult {
  const v2 = editorV2(editor);
  const meta = v2 === null ? undefined : collectionMeta(v2, collection);
  if (v2 === null || meta === undefined) return { values, itemId: null };
  const items = collectionItems(values, collection) ?? [];
  const source = items.find((item) => item[meta.itemKey] === itemId);
  if (source === undefined) return { values, itemId: null };
  const nextId = createTemplateItemId();
  const duplicate = { ...clone(source), [meta.itemKey]: nextId };
  let next: TemplateParamValues = { ...values, [collection]: [...items, duplicate] };
  next = copyPlacements(next, v2, collection, itemId, nextId);
  return { values: next, itemId: nextId };
}

/** Supprime un élément et les placements qui le référencent. */
export function removeCollectionItem(
  values: TemplateParamValues,
  editor: TemplateEditorManifest,
  collection: string,
  itemId: string,
): TemplateParamValues {
  const v2 = editorV2(editor);
  const meta = v2 === null ? undefined : collectionMeta(v2, collection);
  if (v2 === null || meta === undefined) return values;
  const items = collectionItems(values, collection);
  if (items === null) return values;
  const next: TemplateParamValues = {
    ...values,
    [collection]: items.filter((item) => item[meta.itemKey] !== itemId),
  };
  const children = v2.structure?.children;
  if (children !== undefined) {
    const placements = collectionItems(next, children.through);
    if (placements !== null) {
      next[children.through] = placements.filter(
        (placement) =>
          placement[children.childKey] !== itemId && placement[children.parentKey] !== itemId,
      );
    }
  }
  return next;
}
