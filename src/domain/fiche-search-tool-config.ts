/**
 * Configuration versionnée de l'outil de recherche (ADR-0067 §2.5, §4.9).
 * Les valeurs par défaut sont sûres : statut imposé masqué, portée chatbot,
 * rotation équitable. `relevance` reste structurellement accepté pour ne pas
 * casser une configuration existante, mais n'est pas activable.
 */

import { type ChatLinkChannels, isPublicChatLink } from "@/domain/entities/chat";
import { STATUS_KEY_PATTERN } from "@/domain/entities/fiche-status";
import {
  FICHE_SCOPES,
  FICHE_SORT_MODES,
  FICHE_STATUS_MODES,
  type FicheScope,
  type FicheSearchToolConfig,
  type FicheSortMode,
  type FicheStatusMode,
  isFicheScope,
  isFicheSortMode,
  isFicheStatusMode,
} from "@/domain/fiche-search-tool";

const FICHE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SEARCH_TOOL_FICHE_TYPES = 50;
export const MAX_SEARCH_TOOL_FIXED_STATUSES = 50;

/** Valeurs par défaut d'un chatbot public (MandamPro, ADR-0067 §2.6). */
export function defaultSearchToolConfig(): FicheSearchToolConfig {
  return {
    ficheTypes: [],
    statusMode: "hidden_fixed",
    fixedStatusKeys: [],
    sortMode: "fair_rotation",
    scope: "chat_link",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseKeys(
  value: unknown,
  pattern: RegExp,
  label: string,
  max: number,
  errors: string[],
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    errors.push(`${label} : liste attendue`);
    return [];
  }
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") {
      errors.push(`${label} : clé texte attendue`);
      continue;
    }
    const key = entry.trim();
    if (!pattern.test(key)) {
      errors.push(`${label} invalide : « ${key === "" ? "(vide)" : key} »`);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
    if (keys.length > max) {
      errors.push(`${label} : ${max} valeurs maximum`);
      break;
    }
  }
  return keys;
}

function parseStatusMode(value: unknown, errors: string[]): FicheStatusMode {
  if (value === undefined || value === null) return "hidden_fixed";
  if (!isFicheStatusMode(value)) {
    errors.push(`Mode de statut invalide (${FICHE_STATUS_MODES.join(", ")})`);
    return "hidden_fixed";
  }
  return value;
}

function parseSortMode(value: unknown, errors: string[]): FicheSortMode {
  if (value === undefined || value === null) return "fair_rotation";
  if (!isFicheSortMode(value)) {
    errors.push(`Mode de tri invalide (${FICHE_SORT_MODES.join(", ")})`);
    return "fair_rotation";
  }
  return value;
}

function parseScope(value: unknown, errors: string[]): FicheScope {
  if (value === undefined || value === null) return "chat_link";
  if (!isFicheScope(value)) {
    errors.push(`Portée invalide (${FICHE_SCOPES.join(", ")})`);
    return "chat_link";
  }
  return value;
}

/** Normalise et valide le bloc `searchTool` d'un snapshot chatbot. */
export function parseSearchToolConfig(
  input: unknown,
): { ok: true; value: FicheSearchToolConfig } | { ok: false; errors: string[] } {
  if (input === undefined || input === null) {
    return { ok: true, value: defaultSearchToolConfig() };
  }
  if (!isRecord(input)) {
    return { ok: false, errors: ["Configuration de recherche invalide"] };
  }

  const errors: string[] = [];
  const statusMode = parseStatusMode(input.statusMode, errors);
  const sortMode = parseSortMode(input.sortMode, errors);
  const scope = parseScope(input.scope, errors);
  const ficheTypes = parseKeys(
    input.ficheTypes,
    FICHE_KEY_PATTERN,
    "Type de fiche",
    MAX_SEARCH_TOOL_FICHE_TYPES,
    errors,
  );
  const fixedStatusKeys = parseKeys(
    input.fixedStatusKeys,
    STATUS_KEY_PATTERN,
    "Statut fixe",
    MAX_SEARCH_TOOL_FIXED_STATUSES,
    errors,
  );

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: { ficheTypes, statusMode, fixedStatusKeys, sortMode, scope },
  };
}

/** Erreur de politique de l'outil (traduite en 422 par la couche application). */
export class FicheSearchToolConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FicheSearchToolConfigError";
  }
}

/**
 * Retourne le motif de refus, ou `null` si la configuration est autorisée.
 * Sur un lien public, seuls `hidden_fixed` et `scope = chat_link` sont permis.
 */
export function searchToolConfigViolation(
  channels: ChatLinkChannels,
  config: FicheSearchToolConfig,
): string | null {
  if (!isPublicChatLink(channels)) return null;
  if (config.statusMode !== "hidden_fixed") {
    return "Le mode de statut backoffice est interdit sur un lien public";
  }
  if (config.scope !== "chat_link") {
    return "La portée organisation est interdite sur un lien public";
  }
  return null;
}

export function assertSearchToolConfigAllowedForLink(
  channels: ChatLinkChannels,
  config: FicheSearchToolConfig,
): void {
  const violation = searchToolConfigViolation(channels, config);
  if (violation !== null) throw new FicheSearchToolConfigError(violation);
}
