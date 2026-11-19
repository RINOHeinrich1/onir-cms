import type { VisualTemplateOption } from "@/components/links/types";
import {
  encodeParamsOverride,
  paramsSchemaForSelection,
} from "@/components/links/visual-template-selection";
import type { ChatLinkSurface } from "@/domain/entities/chat";
import {
  mergeTemplateParams,
  type TemplateParamSchema,
  type TemplateParamValues,
} from "@/domain/template-params";
import { latestTemplateVersion } from "@/domain/template-version";
import type { WidgetDisplay, WidgetPosition } from "@/domain/widget";
import type { StudioDevice, StudioLink, StudioTab } from "./types";

export function selectionFor(templateId: string, version: string): string {
  return `${templateId}@${version}`;
}

export function latestSelection(template: VisualTemplateOption): string {
  const latest = latestTemplateVersion(template.versions);
  return latest === null ? "" : selectionFor(template.id, latest.version);
}

/** Première version installée compatible avec la surface demandée. */
export function firstSelectableSelection(
  templates: VisualTemplateOption[],
  surface: ChatLinkSurface,
): string {
  for (const template of templates) {
    const versions =
      surface === "widget"
        ? template.versions.filter((entry) => entry.widget !== null)
        : template.versions;
    const latest = latestTemplateVersion(versions);
    if (latest !== null) return selectionFor(template.id, latest.version);
  }
  return "";
}

export function selectedTemplate(
  templates: VisualTemplateOption[],
  selection: string,
): VisualTemplateOption | null {
  const { id } = parseSelection(selection);
  return templates.find((template) => template.id === id) ?? null;
}

export function selectedVersion(
  templates: VisualTemplateOption[],
  selection: string,
): { version: string; params: TemplateParamSchema[]; widget: WidgetDisplay | null } | null {
  const { id, version } = parseSelection(selection);
  if (id === null || version === null) return null;
  return (
    templates.find((template) => template.id === id)?.versions.find(
      (entry) => entry.version === version,
    ) ?? null
  );
}

export function parseSelection(selection: string): {
  id: string | null;
  version: string | null;
} {
  if (selection === "") return { id: null, version: null };
  const at = selection.lastIndexOf("@");
  if (at <= 0 || at === selection.length - 1) return { id: null, version: null };
  return { id: selection.slice(0, at), version: selection.slice(at + 1) };
}

/** Complète les valeurs avec les défauts du schéma et écarte les valeurs invalides. */
export function resolvedParams(
  schema: TemplateParamSchema[],
  values: TemplateParamValues,
): TemplateParamValues {
  return mergeTemplateParams(schema, schema, values).values;
}

export function paramsForSelection(
  templates: VisualTemplateOption[],
  selection: string,
  fallback: TemplateParamValues,
): TemplateParamValues {
  const schema = paramsSchemaForSelection(templates, selection);
  return resolvedParams(schema, fallback);
}

export function widgetDisplayFor(
  templates: VisualTemplateOption[],
  selection: string,
): WidgetDisplay | null {
  return selectedVersion(templates, selection)?.widget ?? null;
}

export function widgetPositions(display: WidgetDisplay | null): WidgetPosition[] {
  if (display === null) return [];
  return display.allowedPositions;
}

function widgetToken(url: string | null): string | null {
  if (url === null) return null;
  const match = /\/l\/([^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

/** URL d'aperçu du template avec surcharge des paramètres (même contrat que l'aperçu de lien). */
export function buildPreviewSrc(input: {
  link: StudioLink;
  surface: ChatLinkSurface;
  selection: string;
  params: TemplateParamValues;
  widgetPosition: WidgetPosition;
  refreshKey?: number;
}): string {
  const params = encodeParamsOverride(input.params);
  const template = input.selection;
  const cacheBust =
    input.refreshKey === undefined ? "" : `&_r=${encodeURIComponent(String(input.refreshKey))}`;

  if (input.surface === "widget") {
    const token = widgetToken(input.link.url);
    if (token !== null) {
      const query = new URLSearchParams();
      if (template !== "") query.set("template", template);
      if (params !== "") query.set("params", params);
      query.set("position", input.widgetPosition);
      return `/embed/${encodeURIComponent(token)}/preview?${query.toString()}${cacheBust}`;
    }
  }

  const query = new URLSearchParams();
  query.set("embed", "1");
  query.set("surface", input.surface);
  query.set("template", template);
  query.set("params", params);
  return `/liens/${input.link.id}/apercu?${query.toString()}${cacheBust}`;
}

export function previewDimensions(device: StudioDevice): {
  width: number;
  height: number;
  label: string;
} {
  switch (device) {
    case "tablet":
      return { width: 834, height: 1112, label: "Tablette · 834 × 1112" };
    case "mobile":
      return { width: 390, height: 844, label: "Mobile · 390 × 844" };
    default:
      return { width: 1280, height: 800, label: "Bureau · 1280 × 800" };
  }
}

export function filterParams(
  schema: TemplateParamSchema[],
  tab: StudioTab,
  query: string,
): TemplateParamSchema[] {
  const needle = query.trim().toLowerCase();
  const byTab = schema.filter((param) => {
    switch (tab) {
      case "content":
        return ["string", "text", "url", "select"].includes(param.type);
      case "colors":
        return param.type === "color";
      case "images":
        return param.type === "image";
      case "advanced":
        return ["number", "boolean", "object", "array"].includes(param.type);
      default:
        return true;
    }
  });
  if (needle === "") return byTab;
  return byTab.filter((param) =>
    [param.key, param.label, param.description]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export function countByTab(schema: TemplateParamSchema[], tab: StudioTab): number {
  return filterParams(schema, tab, "").length;
}
