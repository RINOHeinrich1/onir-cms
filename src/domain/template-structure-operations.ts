import type {
  TemplateEditorInsertionRule,
  TemplateEditorManifest,
  TemplateEditorManifestV2,
} from "@/domain/template-editor";
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

/** Ajoute un enfant typé sous un parent existant, via une règle d'insertion. */
export function addCollectionChildItem(
  values: TemplateParamValues,
  editor: TemplateEditorManifest,
  rule: TemplateEditorInsertionRule,
  parentId: string,
  item: RecordValue,
  placementParentKind?: string,
): TemplateStructureOperationResult {
  const v2 = editorV2(editor);
  const children = v2?.structure?.children;
  const meta = v2 === null ? undefined : collectionMeta(v2, rule.childCollection);
  const throughMeta = v2 === null ? undefined : collectionMeta(v2, children?.through ?? "");
  if (
    v2 === null ||
    children === undefined ||
    children.collection !== rule.childCollection ||
    meta === undefined ||
    throughMeta === undefined
  ) {
    return { values, itemId: null };
  }
  const parentReference = v2.references?.find(
    (reference) =>
      reference.from === children.through &&
      reference.field === children.parentKey &&
      reference.targets !== undefined,
  );
  const parentKind =
    placementParentKind ??
    Object.entries(parentReference?.targets ?? {}).find(
      ([, collection]) => collection === children.collection,
    )?.[0];
  if (parentKind === undefined || parentReference?.targets?.[parentKind] === undefined) {
    return { values, itemId: null };
  }
  const itemId = createTemplateItemId();
  const items = collectionItems(values, rule.childCollection) ?? [];
  const nextItem = { ...clone(item), [meta.itemKey]: itemId };
  const placements = collectionItems(values, children.through) ?? [];
  const siblings = placements.filter(
    (placement) =>
      placement[children.parentKey] === parentId &&
      (children.parentKindKey === undefined || placement[children.parentKindKey] === parentKind),
  );
  const position =
    siblings.reduce((max, placement) => {
      const value = children.orderKey === undefined ? 0 : placement[children.orderKey];
      return typeof value === "number" && value > max ? value : max;
    }, -1) + 1;
  const placement: RecordValue = {
    [throughMeta.itemKey]: createTemplateItemId(),
    [children.parentKey]: parentId,
    [children.parentKindKey ?? "parent_kind"]: parentKind,
    [children.childKey]: itemId,
    [children.slotKey ?? "slot"]: rule.slot,
    [children.orderKey ?? "position"]: position,
  };
  return {
    values: {
      ...values,
      [rule.childCollection]: [...items, nextItem],
      [children.through]: [...placements, placement],
    },
    itemId,
  };
}
