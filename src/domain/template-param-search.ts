import type { TemplateEditorCollection } from "@/domain/template-editor";
import type {
  TemplateParamNode,
  TemplateParamSchema,
  TemplateParamValue,
  TemplateParamValues,
} from "@/domain/template-params";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function isObject(value: unknown): value is Record<string, TemplateParamValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function scalarText(value: TemplateParamValue): string | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function nodeMatches(key: string | null, label: string | null, needle: string): boolean {
  return [key, label].some((value) => value !== null && normalize(value).includes(needle));
}

/**
 * Recherche les chemins dont le libellé ou la valeur contient la requête.
 * Retourne `null` si la requête est vide, sinon l'ensemble des chemins.
 */
export function searchTemplateParamPaths(
  schema: TemplateParamSchema[],
  values: TemplateParamValues,
  collections: TemplateEditorCollection[] | undefined,
  query: string,
): Set<string> | null {
  const needle = normalize(query);
  if (needle === "") return null;
  const paths = new Set<string>();
  const collectionByParam = new Map(
    (collections ?? []).map((collection) => [collection.param, collection]),
  );

  const visit = (
    node: TemplateParamNode,
    value: TemplateParamValue | undefined,
    path: string,
    key: string | null,
    label: string | null,
    hiddenKey: string | undefined,
  ): void => {
    if (nodeMatches(key, label, needle)) {
      paths.add(path);
      return;
    }
    const scalar = value === undefined ? null : scalarText(value);
    if (scalar !== null && normalize(scalar).includes(needle)) {
      paths.add(path);
      return;
    }
    if (node.type === "object") {
      const record = isObject(value) ? value : {};
      for (const property of node.properties ?? []) {
        if (property.key === hiddenKey) continue;
        visit(
          property,
          record[property.key],
          `${path}.${property.key}`,
          property.key,
          property.label,
          undefined,
        );
      }
      return;
    }
    if (node.type === "array" && node.items !== undefined) {
      const items = Array.isArray(value) ? value : [];
      const collection = collectionByParam.get(path);
      items.forEach((entry, index) => {
        visit(
          node.items as TemplateParamNode,
          entry,
          `${path}[${index}]`,
          null,
          null,
          collection?.itemKey,
        );
      });
    }
  };

  for (const param of schema) {
    visit(param, values[param.key], param.key, param.key, param.label, undefined);
  }
  return paths;
}
