import { isSharedCollection } from "@/domain/template-edit-scope";
import type { TemplateEditorManifest, TemplateEditorManifestV2 } from "@/domain/template-editor";
import {
  validateTemplateEditorCollectionValues,
  validateTemplateEditorStructureValues,
} from "@/domain/template-editor";
import type {
  TemplateParamNode,
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";
import { validateTemplateParamValues } from "@/domain/template-params";
import {
  addCollectionChildItem,
  addCollectionItem,
  duplicateCollectionItem,
  removeCollectionItem,
} from "@/domain/template-structure-operations";

type RecordValue = Record<string, TemplateParamValue>;

export type ProposalTarget =
  | { kind: "param"; path: string }
  | {
      kind: "page";
      collection: string;
      itemKey: string;
      itemId: string;
    }
  | {
      kind: "collectionItem";
      collection: string;
      itemKey: string;
      itemId: string;
      itemKind?: string;
    }
  | {
      kind: "collectionItemField";
      collection: string;
      itemKey: string;
      itemId: string;
      field: string;
    };

export type TemplateEditOperation =
  | { op: "set"; target: ProposalTarget; value: TemplateParamValue }
  | {
      op: "insert";
      target: { kind: "collection"; collection: string };
      values: RecordValue;
      bindTo?: {
        target: Extract<ProposalTarget, { kind: "collectionItemField" }>;
      };
    }
  | {
      op: "insertChild";
      parent: ProposalTarget;
      child: {
        collection: string;
        kind: string;
        slot: string;
        values: RecordValue;
      };
    }
  | { op: "unset"; target: ProposalTarget }
  | { op: "remove"; target: ProposalTarget }
  | { op: "duplicate"; target: ProposalTarget }
  | {
      op: "move";
      target: ProposalTarget;
      parent: ProposalTarget;
      position: number;
    };

export type TemplateEditProposal = {
  operations: TemplateEditOperation[];
  warnings?: string[];
};

export type TemplateEditProposalError = { field: string; message: string };

export type TemplateEditApplyResult =
  | {
      ok: true;
      values: TemplateParamValues;
      itemIds: string[];
      warnings: string[];
    }
  | { ok: false; errors: TemplateEditProposalError[] };

export type TemplateEditProposalInput = {
  editor: TemplateEditorManifest;
  schema: TemplateParamSchema[];
  values: TemplateParamValues;
  proposal: TemplateEditProposal;
};

const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function collectionMeta(editor: TemplateEditorManifestV2, collection: string) {
  return editor.collections?.find((entry) => entry.param === collection);
}

function collectionItems(values: TemplateParamValues, collection: string): RecordValue[] | null {
  const raw = values[collection];
  if (!Array.isArray(raw)) return null;
  return raw.filter(isRecord);
}

function findCollectionItem(
  values: TemplateParamValues,
  collection: string,
  itemKey: string,
  itemId: string,
): RecordValue | null {
  return collectionItems(values, collection)?.find((item) => item[itemKey] === itemId) ?? null;
}

function paramNodeAt(schema: TemplateParamSchema[], path: string): TemplateParamNode | null {
  const segments = path.split(".");
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "" || FORBIDDEN_KEYS.has(segment))
  ) {
    return null;
  }
  const first = segments[0];
  let current: TemplateParamNode | undefined = schema.find((entry) => entry.key === first);
  for (const segment of segments.slice(1)) {
    if (current?.type !== "object") return null;
    current = current.properties?.find((entry) => entry.key === segment);
  }
  return current ?? null;
}

function setParamPath(
  values: TemplateParamValues,
  path: string,
  value: TemplateParamValue,
): TemplateParamValues | null {
  const segments = path.split(".");
  if (
    segments.length === 0 ||
    segments.some((segment) => segment === "" || FORBIDDEN_KEYS.has(segment))
  ) {
    return null;
  }
  const next = clone(values);
  let current: RecordValue = next;
  for (const segment of segments.slice(0, -1)) {
    const child = current[segment];
    if (!isRecord(child)) current[segment] = {};
    current = current[segment] as RecordValue;
  }
  const last = segments[segments.length - 1];
  if (last === undefined) return null;
  current[last] = clone(value);
  return next;
}

function targetArray(
  values: TemplateParamValues,
  target: Extract<ProposalTarget, { kind: "collectionItem" | "collectionItemField" }>,
): RecordValue | null {
  return findCollectionItem(values, target.collection, target.itemKey, target.itemId);
}

function applySet(
  input: TemplateEditProposalInput,
  target: ProposalTarget,
  value: TemplateParamValue,
): { values?: TemplateParamValues; error?: TemplateEditProposalError } {
  if (target.kind === "param") {
    if (paramNodeAt(input.schema, target.path) === null) {
      return { error: { field: target.path, message: "paramètre inexistant" } };
    }
    const values = setParamPath(input.values, target.path, value);
    return values === null
      ? { error: { field: target.path, message: "chemin de paramètre invalide" } }
      : { values };
  }
  if (target.kind === "collectionItemField") {
    if (target.field === "" || FORBIDDEN_KEYS.has(target.field)) {
      return { error: { field: target.field, message: "champ invalide" } };
    }
    if (isSharedCollection(input.editor, target.collection)) {
      return {
        error: {
          field: target.collection,
          message: "élément partagé : créez une copie locale au lieu de le modifier",
        },
      };
    }
    const item = targetArray(input.values, target);
    if (item === null) {
      return { error: { field: target.itemId, message: "élément introuvable" } };
    }
    const next = clone(input.values);
    const nextItem = findCollectionItem(next, target.collection, target.itemKey, target.itemId);
    if (nextItem === null) {
      return { error: { field: target.itemId, message: "élément introuvable" } };
    }
    nextItem[target.field] = clone(value);
    return { values: next };
  }
  return { error: { field: target.kind, message: "cible incompatible avec set" } };
}

function parentKind(target: ProposalTarget): string | null {
  if (target.kind === "page") return "page";
  if (target.kind === "collectionItem") {
    if (target.itemKind !== undefined && target.itemKind !== "") return target.itemKind;
    return target.collection.replace(/s$/, "");
  }
  return null;
}

function placementParentKind(target: ProposalTarget): string | null {
  if (target.kind === "page") return "page";
  if (target.kind === "collectionItem") return target.collection.replace(/s$/, "");
  return null;
}

function applyInsertChild(
  input: TemplateEditProposalInput,
  parent: ProposalTarget,
  child: {
    collection: string;
    kind: string;
    slot: string;
    values: RecordValue;
  },
): { values?: TemplateParamValues; itemId?: string; error?: TemplateEditProposalError } {
  if (input.editor.version !== 2 || input.editor.structure?.children === undefined) {
    return { error: { field: "editor.structure", message: "structure absente" } };
  }
  if (parent.kind !== "collectionItem" && parent.kind !== "page") {
    return { error: { field: "parent", message: "parent d'insertion invalide" } };
  }
  const parentKindValue = parentKind(parent);
  const placementKindValue = placementParentKind(parent);
  if (parentKindValue === null || placementKindValue === null) {
    return { error: { field: "parent", message: "type de parent introuvable" } };
  }
  const expectedCollection =
    parent.kind === "page" || parent.collection === input.editor.structure.roots
      ? input.editor.structure.roots
      : input.editor.structure.children.collection;
  if (parent.collection !== expectedCollection) {
    return { error: { field: "parent.collection", message: "parent hors collection structurée" } };
  }
  const rule = input.editor.insertion?.find(
    (entry) =>
      entry.parentKind === parentKindValue &&
      entry.childCollection === child.collection &&
      entry.allowedKinds.includes(child.kind) &&
      entry.slot === child.slot,
  );
  if (rule === undefined) {
    return {
      error: {
        field: "child",
        message: "aucune règle d'insertion compatible pour cette cible",
      },
    };
  }
  const result = addCollectionChildItem(
    input.values,
    input.editor,
    rule,
    parent.itemId,
    { kind: child.kind, ...child.values },
    placementKindValue,
  );
  return result.itemId === null
    ? { error: { field: "child", message: "insertion impossible" } }
    : { values: result.values, itemId: result.itemId };
}

function applyMove(
  input: TemplateEditProposalInput,
  target: ProposalTarget,
  parent: ProposalTarget,
  position: number,
): { values?: TemplateParamValues; error?: TemplateEditProposalError } {
  if (input.editor.version !== 2 || input.editor.structure?.children === undefined) {
    return { error: { field: "editor.structure", message: "structure absente" } };
  }
  if (
    target.kind !== "collectionItem" ||
    (parent.kind !== "collectionItem" && parent.kind !== "page")
  ) {
    return { error: { field: "target", message: "déplacement invalide" } };
  }
  if (!Number.isInteger(position) || position < 0) {
    return { error: { field: "position", message: "position entière positive requise" } };
  }
  const children = input.editor.structure.children;
  const items = collectionItems(input.values, children.through);
  if (items === null) return { error: { field: children.through, message: "placements absents" } };
  const index = items.findIndex((item) => item[children.childKey] === target.itemId);
  if (index < 0) return { error: { field: target.itemId, message: "placement introuvable" } };
  const next = clone(input.values);
  const nextItems = collectionItems(next, children.through);
  if (nextItems === null)
    return { error: { field: children.through, message: "placements absents" } };
  const placement = nextItems[index];
  if (placement === undefined)
    return { error: { field: "placement", message: "placement introuvable" } };
  const parentKindValue = placementParentKind(parent);
  if (parentKindValue === null)
    return { error: { field: "parent", message: "type de parent introuvable" } };
  placement[children.parentKey] = parent.itemId;
  placement[children.parentKindKey ?? "parent_kind"] = parentKindValue;
  placement[children.orderKey ?? "position"] = position;
  return { values: next };
}

/** Valide et applique une proposition sur une copie des valeurs. */
export function applyTemplateEditProposal(
  input: TemplateEditProposalInput,
): TemplateEditApplyResult {
  let values = clone(input.values);
  const itemIds: string[] = [];
  const errors: TemplateEditProposalError[] = [];

  for (const [index, operation] of input.proposal.operations.entries()) {
    const field = `operations[${index}]`;
    if (operation.op === "set") {
      const result = applySet({ ...input, values }, operation.target, operation.value);
      if (result.error !== undefined) {
        errors.push({ ...result.error, field: `${field}.${result.error.field}` });
        break;
      }
      if (result.values !== undefined) values = result.values;
      continue;
    }
    if (operation.op === "insert") {
      if (input.editor.version !== 2) {
        errors.push({ field, message: "editor V2 requis" });
        break;
      }
      const meta = collectionMeta(input.editor, operation.target.collection);
      if (meta === undefined) {
        errors.push({ field: `${field}.target.collection`, message: "collection inconnue" });
        break;
      }
      if (
        input.editor.structure?.children?.collection === operation.target.collection ||
        input.editor.structure?.children?.through === operation.target.collection
      ) {
        errors.push({ field, message: "utiliser insertChild pour une collection structurelle" });
        break;
      }
      const result = addCollectionItem(
        values,
        input.editor,
        operation.target.collection,
        operation.values,
      );
      if (result.itemId === null) {
        errors.push({ field, message: "insertion impossible" });
        break;
      }
      values = result.values;
      itemIds.push(result.itemId);
      if (operation.bindTo !== undefined) {
        const bound = findCollectionItem(
          values,
          operation.bindTo.target.collection,
          operation.bindTo.target.itemKey,
          operation.bindTo.target.itemId,
        );
        if (bound === null) {
          errors.push({ field: `${field}.bindTo`, message: "cible de liaison introuvable" });
          break;
        }
        if (isSharedCollection(input.editor, operation.bindTo.target.collection)) {
          errors.push({
            field: `${field}.bindTo`,
            message: "la cible de liaison est partagée",
          });
          break;
        }
        bound[operation.bindTo.target.field] = result.itemId;
      }
      continue;
    }
    if (operation.op === "insertChild") {
      const result = applyInsertChild({ ...input, values }, operation.parent, operation.child);
      if (result.error !== undefined) {
        errors.push({ ...result.error, field: `${field}.${result.error.field}` });
        break;
      }
      if (result.values !== undefined) values = result.values;
      if (result.itemId !== undefined) itemIds.push(result.itemId);
      continue;
    }
    if (operation.op === "unset") {
      const target = operation.target;
      if (target.kind !== "collectionItemField") {
        errors.push({ field, message: "unset exige un collectionItemField" });
        break;
      }
      if (input.editor.version !== 2) {
        errors.push({ field, message: "editor V2 requis pour unset" });
        break;
      }
      const reference = input.editor.references?.find(
        (entry) => entry.from === target.collection && entry.field === target.field,
      );
      if (reference === undefined || reference.optional !== true) {
        errors.push({
          field: `${field}.target.field`,
          message: "unset autorisé uniquement sur une référence optionnelle",
        });
        break;
      }
      const result = applySet({ ...input, values }, target, "");
      if (result.error !== undefined) {
        errors.push({ ...result.error, field: `${field}.${result.error.field}` });
        break;
      }
      if (result.values !== undefined) values = result.values;
      continue;
    }
    if (operation.op === "remove") {
      if (operation.target.kind !== "collectionItem") {
        errors.push({ field, message: "remove exige un collectionItem" });
        break;
      }
      if (targetArray(values, operation.target) === null) {
        errors.push({ field: `${field}.target`, message: "élément introuvable" });
        break;
      }
      values = removeCollectionItem(
        values,
        input.editor,
        operation.target.collection,
        operation.target.itemId,
      );
      continue;
    }
    if (operation.op === "duplicate") {
      if (operation.target.kind !== "collectionItem") {
        errors.push({ field, message: "duplicate exige un collectionItem" });
        break;
      }
      if (targetArray(values, operation.target) === null) {
        errors.push({ field: `${field}.target`, message: "élément introuvable" });
        break;
      }
      const result = duplicateCollectionItem(
        values,
        input.editor,
        operation.target.collection,
        operation.target.itemId,
      );
      if (result.itemId === null) {
        errors.push({ field, message: "duplication impossible" });
        break;
      }
      values = result.values;
      itemIds.push(result.itemId);
      continue;
    }
    if (operation.op === "move") {
      const result = applyMove(
        { ...input, values },
        operation.target,
        operation.parent,
        operation.position,
      );
      if (result.error !== undefined) {
        errors.push({ ...result.error, field: `${field}.${result.error.field}` });
        break;
      }
      if (result.values !== undefined) values = result.values;
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  errors.push(
    ...validateTemplateParamValues(input.schema, values).map((error) => ({
      field: error.field,
      message: error.message,
    })),
  );
  if (input.editor.version === 2) {
    errors.push(
      ...validateTemplateEditorCollectionValues(input.editor, values).map((error) => ({
        field: error.field,
        message: error.message,
      })),
    );
    errors.push(
      ...validateTemplateEditorStructureValues(input.editor, values).map((error) => ({
        field: error.field,
        message: error.message,
      })),
    );
  }
  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    values,
    itemIds,
    warnings: input.proposal.warnings ?? [],
  };
}

export function validateTemplateEditProposal(
  input: TemplateEditProposalInput,
): TemplateEditProposalError[] {
  const result = applyTemplateEditProposal(input);
  return result.ok ? [] : result.errors;
}
