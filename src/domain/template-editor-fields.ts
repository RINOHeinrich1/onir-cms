import type {
  TemplateEditorFieldRule,
  TemplateEditorGroup,
  TemplateEditorManifestV2,
  TemplateEditorVisibleWhen,
} from "@/domain/template-editor";
import type { TemplateParamValue } from "@/domain/template-params";

export function groupsForParam(
  groups: TemplateEditorGroup[] | undefined,
  param: string,
): TemplateEditorGroup[] {
  return (groups ?? []).filter((group) => group.param === param);
}

export function fieldRuleFor(
  fields: TemplateEditorFieldRule[] | undefined,
  param: string,
  field: string,
): TemplateEditorFieldRule | undefined {
  return fields?.find((rule) => rule.param === param && rule.field === field);
}

export function isVisibleWhen(
  condition: TemplateEditorVisibleWhen | undefined,
  record: Record<string, TemplateParamValue>,
): boolean {
  if (condition === undefined) return true;
  const value = record[condition.field];
  if ("equals" in condition) return value === condition.equals;
  if ("notEquals" in condition) return value !== condition.notEquals;
  if ("in" in condition) return condition.in.includes(value as never);
  if ("notIn" in condition) return !condition.notIn.includes(value as never);
  if ("truthy" in condition) return Boolean(value) === condition.truthy;
  if ("falsy" in condition) return !value === condition.falsy;
  return true;
}

export function valueLabelFor(
  valueLabels: NonNullable<TemplateEditorManifestV2["valueLabels"]> | undefined,
  param: string,
  field: string,
  value: TemplateParamValue,
): string | null {
  const labels = valueLabels?.[param]?.[field];
  if (labels === undefined) return null;
  const key = String(value);
  return labels[key] ?? null;
}
