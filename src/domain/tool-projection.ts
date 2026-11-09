import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import { isFieldEmpty } from "@/domain/entities/conversation-field";
import {
  MAX_TOOL_FIELD_TEXT,
  MAX_TOOL_FIELDS,
  MAX_TOOL_ITEMS,
  type ToolField,
  type ToolSearchResultItem,
} from "@/domain/tool-blocks";

function truncate(value: string): string {
  return value.length <= MAX_TOOL_FIELD_TEXT ? value : `${value.slice(0, MAX_TOOL_FIELD_TEXT)}…`;
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : truncate(trimmed);
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function multiValue(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const values = value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    .map((entry) => truncate(entry.trim()));
  return values.length === 0 ? null : values;
}

function projectField(field: TemplateField, value: unknown): ToolField | null {
  if (field.type === "file" || isFieldEmpty(field, value)) return null;

  if (field.type === "multi") {
    const values = multiValue(value);
    return values === null
      ? null
      : { key: field.name, label: field.label, type: "multi", value: values };
  }

  if (field.type === "number") {
    const numeric = numberValue(value);
    return numeric === null
      ? null
      : {
          key: field.name,
          label: field.label,
          type: "number",
          value: numeric,
          ...(field.unit === undefined ? {} : { unit: field.unit }),
        };
  }

  const text = stringValue(value);
  return text === null
    ? null
    : {
        key: field.name,
        label: field.label,
        type: field.type as ToolField["type"],
        value: text,
      };
}

/** Projette les données d'une fiche en champs typés, dans l'ordre de la définition. */
export function projectFicheToToolFields(
  definition: TemplateDefinition,
  data: Record<string, unknown>,
): ToolField[] {
  const fields: ToolField[] = [];
  for (const field of definition.fields) {
    if (fields.length >= MAX_TOOL_FIELDS) break;
    const projected = projectField(field, data[field.name]);
    if (projected !== null) fields.push(projected);
  }
  return fields;
}

export type FicheToolInput = {
  definition: TemplateDefinition | null;
  data: Record<string, unknown>;
};

/** Projette plusieurs fiches en items de résultat, dans l'ordre fourni. */
export function projectFichesToToolItems(
  fiches: readonly FicheToolInput[],
): ToolSearchResultItem[] {
  const items: ToolSearchResultItem[] = [];
  for (const fiche of fiches) {
    if (items.length >= MAX_TOOL_ITEMS) break;
    if (fiche.definition === null) continue;
    const fields = projectFicheToToolFields(fiche.definition, fiche.data);
    if (fields.length > 0) items.push({ fields });
  }
  return items;
}
