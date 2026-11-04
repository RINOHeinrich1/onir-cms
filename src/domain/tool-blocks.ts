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
