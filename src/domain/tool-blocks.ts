/**
 * Contrat de rendu générique des outils (ADR-0067 §5).
 * Le cœur transmet des champs typés, jamais une structure de carte propre à
 * une fiche. Le template rend par type de champ.
 */

export const TOOL_CONTRACT_VERSION = 1 as const;

export const MAX_TOOL_ITEMS = 50;
export const MAX_TOOL_FIELDS = 40;
export const MAX_TOOL_FIELD_TEXT = 1000;

export const TOOL_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "url",
  "email",
  "image",
  "select",
  "multi",
] as const;

export type ToolFieldType = (typeof TOOL_FIELD_TYPES)[number];

export type ToolFieldValue = string | number | string[] | null;

export type ToolField = {
  key: string;
  label: string;
  type: ToolFieldType;
  value: ToolFieldValue;
  /** Unité d'affichage d'un nombre (ex. "€", "Ar"). */
  unit?: string;
};

export type ToolSearchResultItem = {
  fields: ToolField[];
};

export type TextMessageBlock = {
  type: "text";
  text: string;
};

export type ImageMessageBlock = {
  type: "image";
  url: string;
  alt?: string;
};

export type ToolSearchResultBlock = {
  type: "tool_search_result";
  contractVersion: typeof TOOL_CONTRACT_VERSION;
  tool: string;
  layout?: "card" | "list";
  items: ToolSearchResultItem[];
  meta?: {
    total?: number;
    hasMore?: boolean;
  };
};

export type MessageBlock = TextMessageBlock | ImageMessageBlock | ToolSearchResultBlock;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isToolFieldType(value: unknown): value is ToolFieldType {
  return typeof value === "string" && (TOOL_FIELD_TYPES as readonly string[]).includes(value);
}

/**
 * Parse un champ de confiance (base, SDK, sortie d'outil). Aucune valeur
 * objet, aucun statut, aucun fichier : seuls les types du contrat passent.
 */
export function parseToolField(value: unknown): ToolField | null {
  if (!isRecord(value)) return null;
  const key = typeof value.key === "string" ? value.key.trim() : "";
  if (key === "") return null;
  const type = value.type;
  if (!isToolFieldType(type)) return null;
  const label = typeof value.label === "string" && value.label.trim() !== "" ? value.label : key;

  const raw = value.value;
  let projected: ToolFieldValue;
  if (Array.isArray(raw)) {
    projected = raw.filter((entry): entry is string => typeof entry === "string");
  } else if (typeof raw === "number" && Number.isFinite(raw)) {
    projected = raw;
  } else if (typeof raw === "string") {
    projected = raw;
  } else if (raw === null) {
    projected = null;
  } else {
    return null;
  }
  const unit =
    typeof value.unit === "string" && value.unit.trim() !== "" ? { unit: value.unit } : {};
  return { key, label, type, value: projected, ...unit };
}

/** Parse une liste de blocs persistés/sérialisés ; tout élément invalide est ignoré. */
export function parseMessageBlocks(value: unknown): MessageBlock[] {
  if (!Array.isArray(value)) return [];
  const blocks: MessageBlock[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    if (entry.type === "text" && typeof entry.text === "string") {
      blocks.push({ type: "text", text: entry.text });
      continue;
    }
    if (entry.type === "image" && typeof entry.url === "string") {
      blocks.push({
        type: "image",
        url: entry.url,
        ...(typeof entry.alt === "string" ? { alt: entry.alt } : {}),
      });
      continue;
    }
    if (
      entry.type === "tool_search_result" &&
      entry.contractVersion === TOOL_CONTRACT_VERSION &&
      typeof entry.tool === "string" &&
      Array.isArray(entry.items)
    ) {
      const items: ToolSearchResultItem[] = [];
      for (const item of entry.items) {
        if (items.length >= MAX_TOOL_ITEMS) break;
        if (!isRecord(item) || !Array.isArray(item.fields)) continue;
        const fields: ToolField[] = [];
        for (const field of item.fields) {
          if (fields.length >= MAX_TOOL_FIELDS) break;
          const parsed = parseToolField(field);
          if (parsed !== null) fields.push(parsed);
        }
        if (fields.length > 0) items.push({ fields });
      }
      const meta = isRecord(entry.meta) ? entry.meta : {};
      blocks.push({
        type: "tool_search_result",
        contractVersion: TOOL_CONTRACT_VERSION,
        tool: entry.tool,
        ...(entry.layout === "card" || entry.layout === "list" ? { layout: entry.layout } : {}),
        items,
        ...(typeof meta.total === "number" || typeof meta.hasMore === "boolean"
          ? {
              meta: {
                ...(typeof meta.total === "number" ? { total: meta.total } : {}),
                ...(typeof meta.hasMore === "boolean" ? { hasMore: meta.hasMore } : {}),
              },
            }
          : {}),
      });
    }
  }
  return blocks;
}
