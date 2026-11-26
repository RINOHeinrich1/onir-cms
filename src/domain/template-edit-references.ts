import type { TemplateEditorManifest } from "@/domain/template-editor";
import type { TemplateParamValue, TemplateParamValues } from "@/domain/template-params";

export type TemplateEditReferenceError = { field: string; message: string };

function isRecord(value: unknown): value is Record<string, TemplateParamValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scalar(value: TemplateParamValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function items(
  values: TemplateParamValues,
  collection: string,
): Record<string, TemplateParamValue>[] {
  const raw = values[collection];
  if (!Array.isArray(raw)) return [];
  return raw.filter(isRecord);
}

/** Vérifie que les références déclarées pointent vers des éléments réellement présents. */
export function validateTemplateEditReferences(
  editor: TemplateEditorManifest,
  values: TemplateParamValues,
): TemplateEditReferenceError[] {
  if (editor.version !== 2 || editor.references === undefined) return [];
  const errors: TemplateEditReferenceError[] = [];
  for (const reference of editor.references) {
    const targetCollections =
      reference.to === undefined ? Object.values(reference.targets ?? {}) : [reference.to];
    if (targetCollections.length === 0) continue;
    const targetIds = new Set<string>();
    for (const collection of targetCollections) {
      for (const target of items(values, collection)) {
        const id = scalar(target[reference.targetKey]);
        if (id !== "") targetIds.add(id);
      }
    }
    for (const source of items(values, reference.from)) {
      const value = source[reference.field];
      if (Array.isArray(value)) {
        value.forEach((entry, index) => {
          const id = scalar(entry);
          if (id !== "" && !targetIds.has(id)) {
            errors.push({
              field: `${reference.from}.${scalar(source.id)}.${reference.field}[${index}]`,
              message: `référence introuvable vers ${targetCollections.join(" | ")}`,
            });
          }
        });
        continue;
      }
      const id = scalar(value);
      if (id !== "" && !targetIds.has(id)) {
        errors.push({
          field: `${reference.from}.${scalar(source.id)}.${reference.field}`,
          message: `référence introuvable vers ${targetCollections.join(" | ")}`,
        });
      }
    }
  }
  return errors;
}
