import type { TemplateEditorManifest } from "@/domain/template-editor";
import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";

export type TemplateCapabilityMap = {
  sourceHash: string | null;
  collections: Array<{
    param: string;
    label: string;
    itemKey: string;
    itemLabel: string | null;
    itemKind: string | null;
    fields: string[];
  }>;
  references: Array<{
    from: string;
    field: string;
    targets: Record<string, string>;
  }>;
  insertion: Array<{
    parentKind: string;
    childCollection: string;
    allowedKinds: string[];
    slot: string;
  }>;
  blockKinds: string[];
  actionKinds: string[];
};

function fieldKeys(node: TemplateParamSchema | undefined): string[] {
  if (node?.items?.properties !== undefined) {
    return node.items.properties.map((field) => field.key);
  }
  return (node?.properties ?? []).map((field) => field.key);
}

function distinctKinds(values: TemplateParamValues | undefined, key: string): string[] {
  const raw = values?.[key];
  if (!Array.isArray(raw)) return [];
  const kinds = new Set<string>();
  for (const entry of raw) {
    if (entry !== null && typeof entry === "object" && !Array.isArray(entry)) {
      const kind = (entry as Record<string, unknown>).kind;
      if (typeof kind === "string" && kind !== "") kinds.add(kind);
    }
  }
  return [...kinds].sort();
}

export function buildTemplateCapabilities(
  editor: TemplateEditorManifest,
  schema: TemplateParamSchema[],
  values: TemplateParamValues,
  sourceHash: string | null = null,
): TemplateCapabilityMap {
  const collections =
    editor.version === 2
      ? (editor.collections ?? []).map((collection) => {
          const node = schema.find((entry) => entry.key === collection.param);
          return {
            param: collection.param,
            label: collection.label ?? collection.param,
            itemKey: collection.itemKey,
            itemLabel: collection.itemLabel ?? null,
            itemKind: collection.itemKind ?? null,
            fields: fieldKeys(node),
          };
        })
      : [];
  const references =
    editor.version === 2
      ? (editor.references ?? []).map((reference) => ({
          from: reference.from,
          field: reference.field,
          targets:
            reference.to === undefined
              ? (reference.targets ?? {})
              : { [reference.discriminator ?? "target"]: reference.to },
        }))
      : [];
  const insertion =
    editor.version === 2
      ? (editor.insertion ?? []).map((rule) => ({
          parentKind: rule.parentKind,
          childCollection: rule.childCollection,
          allowedKinds: rule.allowedKinds,
          slot: rule.slot,
        }))
      : [];
  return {
    sourceHash,
    collections,
    references,
    insertion,
    blockKinds: distinctKinds(values, "blocks"),
    actionKinds: distinctKinds(values, "actions"),
  };
}
