"use client";

import type { TemplateParamSchema, TemplateParamValues } from "@/domain/template-params";
import type { VisualTemplateOption } from "./types";

/** Décompose la sélection "templateId@version" du menu. */
export function parseVisualTemplateSelection(value: string): {
  id: string | null;
  version: string | null;
} {
  if (value === "") return { id: null, version: null };
  const at = value.lastIndexOf("@");
  if (at < 0) return { id: null, version: null };
  return { id: value.slice(0, at), version: value.slice(at + 1) };
}

/** Schéma des variables de la version sélectionnée (vide si aucune). */
export function paramsSchemaForSelection(
  templates: VisualTemplateOption[],
  selection: string,
): TemplateParamSchema[] {
  const { id, version } = parseVisualTemplateSelection(selection);
  if (id === null || version === null) return [];
  const template = templates.find((item) => item.id === id);
  return template?.versions.find((entry) => entry.version === version)?.params ?? [];
}

/** Valeurs initiales : les défauts déclarés par le template. */
export function defaultsForSchema(schema: TemplateParamSchema[]): TemplateParamValues {
  const values: TemplateParamValues = {};
  for (const param of schema) values[param.key] = param.default;
  return values;
}

/** Encode un objet en base64url (paramètre `?params=` de l'aperçu). */
export function encodeParamsOverride(values: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
