import type {
  FicheSearchToolConfig,
  FicheSortMode,
  FicheStatusMode,
} from "@/domain/fiche-search-tool";
import { defaultSearchToolConfig, parseSearchToolConfig } from "@/domain/fiche-search-tool-config";

export const CHATBOT_MISSIONS = ["collect", "inform", "hybrid"] as const;
export type ChatbotMission = (typeof CHATBOT_MISSIONS)[number];

export const CHATBOT_MEDIA_ACCESS_MODES = ["on_demand", "illustration"] as const;
export type ChatbotMediaAccessMode = (typeof CHATBOT_MEDIA_ACCESS_MODES)[number];

export const CHATBOT_MEDIA_TYPES = ["photo", "lien"] as const;
export type ChatbotMediaType = (typeof CHATBOT_MEDIA_TYPES)[number];

export type ChatbotSourceSelection = {
  mode: "all" | "selected";
  ids: string[];
};

export type ChatbotFichesSource = FicheSearchToolConfig & {
  label: string;
  usageHint: string;
  matchMode: "strict" | "normalized" | "fuzzy";
};

export type ChatbotConnaissancesSource = {
  enabled: boolean;
  label: string;
  usageHint: string;
  selection: ChatbotSourceSelection;
  maxEntries: number;
};

export type ChatbotMediasSource = {
  enabled: boolean;
  label: string;
  usageHint: string;
  types: ChatbotMediaType[];
  selection: ChatbotSourceSelection;
  access: ChatbotMediaAccessMode;
  maxResults: number;
};

export type ChatbotInformationSources = {
  fiches: ChatbotFichesSource;
  connaissances: ChatbotConnaissancesSource;
  medias: ChatbotMediasSource;
};

const SOURCE_LABEL_PATTERN = /^.{1,120}$/u;
const USAGE_HINT_MAX = 400;
const MAX_SELECTION_IDS = 2000;

export function isChatbotMission(value: unknown): value is ChatbotMission {
  return typeof value === "string" && (CHATBOT_MISSIONS as readonly string[]).includes(value);
}

export function isChatbotMediaType(value: unknown): value is ChatbotMediaType {
  return value === "photo" || value === "lien";
}

export function isChatbotMediaAccessMode(value: unknown): value is ChatbotMediaAccessMode {
  return value === "on_demand" || value === "illustration";
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function label(value: unknown, fallback: string, errors: string[], field: string): string {
  const parsed = text(value) || fallback;
  if (!SOURCE_LABEL_PATTERN.test(parsed)) {
    errors.push(`${field} : libellé invalide`);
  }
  return parsed;
}

function usageHint(value: unknown, fallback: string, errors: string[], field: string): string {
  const parsed = text(value) || fallback;
  if (parsed.length > USAGE_HINT_MAX) {
    errors.push(`${field} : description limitée à ${USAGE_HINT_MAX} caractères`);
  }
  return parsed;
}

function ids(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    if (result.length >= MAX_SELECTION_IDS) break;
  }
  return result;
}

function parseSelection(input: unknown, errors: string[], field: string): ChatbotSourceSelection {
  const raw = record(input);
  if (raw.mode !== undefined && raw.mode !== "all" && raw.mode !== "selected") {
    errors.push(`${field} : mode de sélection invalide`);
  }
  return {
    mode: raw.mode === "selected" ? "selected" : "all",
    ids: ids(raw.ids),
  };
}

function parseMatchMode(value: unknown, errors: string[]): ChatbotFichesSource["matchMode"] {
  if (value === undefined || value === null) return "strict";
  if (value !== "strict" && value !== "normalized" && value !== "fuzzy") {
    errors.push("Mode de correspondance invalide (strict, normalized ou fuzzy)");
    return "strict";
  }
  return value;
}

function parseFichesSource(input: unknown, errors: string[]): ChatbotFichesSource {
  const raw = record(input);
  const parsed = parseSearchToolConfig({ ...raw, matchMode: undefined });
  if (!parsed.ok) {
    errors.push(...parsed.errors.map((error) => `Fiches : ${error}`));
  }
  const fallback = defaultSearchToolConfig();
  const config = parsed.ok ? parsed.value : fallback;
  return {
    ...config,
    label: label(raw.label, "Fiches existantes", errors, "Fiches"),
    usageHint: usageHint(
      raw.usageHint,
      "Rechercher des fiches existantes et leurs informations.",
      errors,
      "Fiches",
    ),
    matchMode: parseMatchMode(raw.matchMode, errors),
  };
}

function parseConnaissancesSource(input: unknown, errors: string[]): ChatbotConnaissancesSource {
  const raw = record(input);
  const maxEntries =
    typeof raw.maxEntries === "number" && Number.isInteger(raw.maxEntries) ? raw.maxEntries : 40;
  if (maxEntries < 1 || maxEntries > 40) {
    errors.push("Connaissances : maxEntries doit être compris entre 1 et 40");
  }
  return {
    enabled: raw.enabled === true,
    label: label(raw.label, "Connaissances", errors, "Connaissances"),
    usageHint: usageHint(
      raw.usageHint,
      "Utiliser la base de connaissances pour répondre aux questions.",
      errors,
      "Connaissances",
    ),
    selection: parseSelection(raw.selection, errors, "Connaissances"),
    maxEntries: Math.max(1, Math.min(40, maxEntries)),
  };
}

function parseMediasSource(input: unknown, errors: string[]): ChatbotMediasSource {
  const raw = record(input);
  const rawTypes = Array.isArray(raw.types) ? raw.types : ["photo", "lien"];
  const parsedTypes = rawTypes.filter(isChatbotMediaType);
  const enabled = raw.enabled === true;
  const types: ChatbotMediaType[] =
    parsedTypes.length === 0 && !enabled ? ["photo", "lien"] : parsedTypes;
  if (types.length === 0) errors.push("Médias : au moins un type est requis");
  const maxResults =
    typeof raw.maxResults === "number" && Number.isInteger(raw.maxResults) ? raw.maxResults : 3;
  if (maxResults < 1 || maxResults > 3) {
    errors.push("Médias : maxResults doit être compris entre 1 et 3");
  }
  return {
    enabled,
    label: label(raw.label, "Photos et liens", errors, "Médias"),
    usageHint: usageHint(
      raw.usageHint,
      "Utiliser les médias accessibles pour illustrer la réponse.",
      errors,
      "Médias",
    ),
    types: [...new Set(types)],
    selection: parseSelection(raw.selection, errors, "Médias"),
    access: isChatbotMediaAccessMode(raw.access) ? raw.access : "on_demand",
    maxResults: Math.max(1, Math.min(3, maxResults)),
  };
}

export function defaultChatbotInformationSources(): ChatbotInformationSources {
  return {
    fiches: {
      ...defaultSearchToolConfig(),
      label: "Fiches existantes",
      usageHint: "Rechercher des fiches existantes et leurs informations.",
      matchMode: "normalized",
    },
    connaissances: {
      enabled: false,
      label: "Connaissances",
      usageHint: "Utiliser la base de connaissances pour répondre aux questions.",
      selection: { mode: "all", ids: [] },
      maxEntries: 40,
    },
    medias: {
      enabled: false,
      label: "Photos et liens",
      usageHint: "Utiliser les médias accessibles pour illustrer la réponse.",
      types: ["photo", "lien"],
      selection: { mode: "all", ids: [] },
      access: "on_demand",
      maxResults: 3,
    },
  };
}

export function parseChatbotInformationSources(
  input: unknown,
): { ok: true; value: ChatbotInformationSources } | { ok: false; errors: string[] } {
  if (input === undefined || input === null) {
    return { ok: true, value: defaultChatbotInformationSources() };
  }
  const raw = record(input);
  const errors: string[] = [];
  const value = {
    fiches: parseFichesSource(raw.fiches, errors),
    connaissances: parseConnaissancesSource(raw.connaissances, errors),
    medias: parseMediasSource(raw.medias, errors),
  };
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value };
}

export function validateChatbotMission(
  mission: ChatbotMission,
  fiches: readonly { key: string }[],
  sources: ChatbotInformationSources,
): string[] {
  const errors: string[] = [];
  const enabled = [
    sources.fiches.enabled,
    sources.connaissances.enabled,
    sources.medias.enabled,
  ].filter(Boolean).length;
  if (mission === "collect") {
    if (fiches.length === 0) errors.push("Mission collect : une fiche de collecte est requise");
    if (enabled > 0) errors.push("Mission collect : aucune source d'information n'est autorisée");
  }
  if (mission === "inform") {
    if (fiches.length > 0) errors.push("Mission inform : aucune fiche de collecte n'est autorisée");
    if (enabled === 0) errors.push("Mission inform : au moins une source est requise");
  }
  if (mission === "hybrid") {
    if (fiches.length === 0) errors.push("Mission hybrid : une fiche de collecte est requise");
    if (enabled === 0) errors.push("Mission hybrid : au moins une source est requise");
  }
  if (sources.fiches.enabled && sources.fiches.ficheTypes.length === 0) {
    errors.push("Source fiches : sélectionnez au moins une fiche de collecte");
  }
  return errors;
}

export function missionSourceLabels(sources: ChatbotInformationSources): string {
  return [
    sources.fiches.enabled
      ? `- fiches (${sources.fiches.label}) : ${sources.fiches.usageHint}`
      : "",
    sources.connaissances.enabled
      ? `- connaissances (${sources.connaissances.label}) : ${sources.connaissances.usageHint}`
      : "",
    sources.medias.enabled
      ? `- médias (${sources.medias.label}) : ${sources.medias.usageHint}`
      : "",
  ]
    .filter((entry) => entry !== "")
    .join("\n");
}

export function isFichesSourceAvailable(source: ChatbotFichesSource): boolean {
  return source.enabled && source.ficheTypes.length > 0;
}

export function ficheSourceOptions(source: ChatbotFichesSource): {
  enabled: boolean;
  ficheTypes: string[];
  statusMode: FicheStatusMode;
  fixedStatusKeys: string[];
  sortMode: FicheSortMode;
  matchMode: ChatbotFichesSource["matchMode"];
} {
  return {
    enabled: source.enabled,
    ficheTypes: source.ficheTypes,
    statusMode: source.statusMode,
    fixedStatusKeys: source.fixedStatusKeys,
    sortMode: source.sortMode,
    matchMode: source.matchMode,
  };
}
