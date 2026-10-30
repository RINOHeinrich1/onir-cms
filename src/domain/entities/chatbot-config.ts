import type { TemplateField } from "@/domain/entities/chat-template";
import { buildDefaultSystemPrompt } from "@/domain/template-defaults";
import { validateTemplateDefinition } from "@/domain/template-schema";
import {
  normalizeTemplateSimpleSettings,
  type TemplateSimpleSettings,
} from "@/domain/template-settings";

export const MAX_FICHES_PER_CHATBOT = 8;
const FICHE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_FALLBACK_QUESTIONS = 20;
export const MAX_FALLBACK_QUESTION_LENGTH = 120;
export const MAX_FALLBACK_ANSWER_LENGTH = 4000;
export const MAX_FALLBACK_INTRO_LENGTH = 500;
const FALLBACK_QUESTION_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Source du comportement du chatbot : réglages guidés ou prompt expert. */
export type ChatbotBehaviorMode = "guided" | "expert";

export const DEFAULT_CHATBOT_BEHAVIOR_MODE: ChatbotBehaviorMode = "guided";

/**
 * Prompt effectif du mode guidé : généré uniquement depuis les réglages simples.
 * Les instructions de la fiche de collecte restent ajoutées séparément au runtime.
 */
export function buildGuidedChatbotPrompt(simple: TemplateSimpleSettings): string {
  return buildDefaultSystemPrompt({
    role: simple.role,
    objective: simple.objective,
    language: simple.language,
    tone: simple.tone,
    guardrails: simple.guardrails,
    extraInstructions: simple.extraInstructions,
    fields: [],
  });
}

export function isChatbotBehaviorMode(value: unknown): value is ChatbotBehaviorMode {
  return value === "guided" || value === "expert";
}

export type FicheDefinition = {
  key: string;
  label: string;
  description: string;
  intent: string;
  fields: TemplateField[];
  renderTemplate: string;
  instructions: string;
  /** Fiche réutilisable d'origine (snapshot, optionnel). */
  sourceFicheId?: string;
  sourceVersion?: number;
};

/** Mode de sélection des données globales utilisées par le chatbot. */
export type ChatbotDataSelectionMode = "all" | "selected";

export type ChatbotDataSelection = {
  /** `all` : toutes les données globales ; `selected` : sous-ensemble explicite. */
  mode: ChatbotDataSelectionMode;
  /** Identifiants des connaissances globales explicitement sélectionnées. */
  connaissanceIds: string[];
  /** Identifiants des médias globaux (photos et liens) explicitement sélectionnés. */
  mediaIds: string[];
};

export const MAX_DATA_SELECTION_IDS = 2000;

/** Sélection par défaut : toutes les données globales, sans restriction. */
export function defaultChatbotDataSelection(): ChatbotDataSelection {
  return { mode: "all", connaissanceIds: [], mediaIds: [] };
}

function selectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const id = entry.trim();
    if (id === "" || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= MAX_DATA_SELECTION_IDS) break;
  }
  return ids;
}

/** Normalise et valide le bloc `dataSelection` (défaut `all`). */
export function parseChatbotDataSelection(
  input: unknown,
): { ok: true; value: ChatbotDataSelection } | { ok: false; error: string } {
  if (input === undefined || input === null) {
    return { ok: true, value: defaultChatbotDataSelection() };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Sélection de données invalide" };
  }
  const raw = input as Record<string, unknown>;
  const mode = raw.mode;
  if (mode !== undefined && mode !== "all" && mode !== "selected") {
    return { ok: false, error: "Mode de sélection invalide (all ou selected)" };
  }
  return {
    ok: true,
    value: {
      mode: mode === "selected" ? "selected" : "all",
      connaissanceIds: selectionIds(raw.connaissanceIds),
      mediaIds: selectionIds(raw.mediaIds),
    },
  };
}

/** Question/réponse fermée du mode de secours heuristique (ADR-0059). */
export type ChatbotFallbackQuestion = {
  id: string;
  label: string;
  answer: string;
};

/**
 * Secours heuristique : menu fermé de questions/réponses et accès à la fiche
 * de collecte existante. Aucun mot-clé, aucune interprétation du texte libre.
 */
export type ChatbotFallback = {
  enabled: boolean;
  intro: string;
  questions: ChatbotFallbackQuestion[];
  showCollectionForm: boolean;
};

export function defaultChatbotFallback(): ChatbotFallback {
  return {
    enabled: false,
    intro: "L’assistant est momentanément indisponible. Choisissez une option.",
    questions: [],
    showCollectionForm: true,
  };
}

/** Normalise et valide le bloc `fallback` du snapshot chatbot. */
export function parseChatbotFallback(
  input: unknown,
): { ok: true; value: ChatbotFallback } | { ok: false; error: string } {
  if (input === undefined || input === null) {
    return { ok: true, value: defaultChatbotFallback() };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: "Fallback heuristique invalide" };
  }
  const raw = input as Record<string, unknown>;
  if (raw.enabled !== undefined && typeof raw.enabled !== "boolean") {
    return { ok: false, error: "Activation du fallback invalide" };
  }
  if (raw.showCollectionForm !== undefined && typeof raw.showCollectionForm !== "boolean") {
    return { ok: false, error: "Accès à la fiche de collecte invalide" };
  }
  const intro = text(raw.intro);
  if (intro.length > MAX_FALLBACK_INTRO_LENGTH) {
    return {
      ok: false,
      error: `Introduction du fallback limitée à ${MAX_FALLBACK_INTRO_LENGTH} caractères`,
    };
  }
  if (raw.questions !== undefined && !Array.isArray(raw.questions)) {
    return { ok: false, error: "Liste des questions de fallback invalide" };
  }
  const rawQuestions = Array.isArray(raw.questions) ? raw.questions : [];
  if (rawQuestions.length > MAX_FALLBACK_QUESTIONS) {
    return { ok: false, error: `${MAX_FALLBACK_QUESTIONS} questions de fallback maximum` };
  }
  const questions: ChatbotFallbackQuestion[] = [];
  const ids = new Set<string>();
  for (const [index, entry] of rawQuestions.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, error: `Question de fallback ${index + 1} invalide` };
    }
    const item = entry as Record<string, unknown>;
    const id = text(item.id);
    const label = text(item.label);
    const answer = text(item.answer);
    if (!FALLBACK_QUESTION_ID_PATTERN.test(id)) {
      return { ok: false, error: `Identifiant de question de fallback invalide (${id || "vide"})` };
    }
    if (ids.has(id)) {
      return { ok: false, error: `Identifiant de question de fallback en double : ${id}` };
    }
    if (label === "") {
      return { ok: false, error: `Libellé de la question « ${id} » obligatoire` };
    }
    if (label.length > MAX_FALLBACK_QUESTION_LENGTH) {
      return {
        ok: false,
        error: `Libellé de la question « ${id} » limité à ${MAX_FALLBACK_QUESTION_LENGTH} caractères`,
      };
    }
    if (answer === "") {
      return { ok: false, error: `Réponse de la question « ${id} » obligatoire` };
    }
    if (answer.length > MAX_FALLBACK_ANSWER_LENGTH) {
      return {
        ok: false,
        error: `Réponse de la question « ${id} » limitée à ${MAX_FALLBACK_ANSWER_LENGTH} caractères`,
      };
    }
    ids.add(id);
    questions.push({ id, label, answer });
  }
  return {
    ok: true,
    value: {
      enabled: raw.enabled === true,
      intro,
      questions,
      showCollectionForm: raw.showCollectionForm !== false,
    },
  };
}

export type ChatbotConfigInput = {
  /** Mode guidé (réglages simples) ou expert (prompt libre). */
  behaviorMode: ChatbotBehaviorMode;
  /** Prompt effectif stocké en snapshot (généré en guidé, saisi en expert). */
  systemPrompt: string;
  simple: TemplateSimpleSettings;
  fiches: FicheDefinition[];
  /** Données globales autorisées au runtime (défaut : toutes). */
  dataSelection: ChatbotDataSelection;
  /** Secours heuristique fermé (ADR-0059). Absent sur les anciens snapshots. */
  fallback?: ChatbotFallback;
};

export type ChatbotConfig = ChatbotConfigInput & {
  id: string;
  organizationId: string;
  chatLinkId: string;
  version: number;
  createdBy: string | null;
  createdAt: string;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Convertit une fiche brute en définition validée par le moteur de champs existant. */
function parseFiche(
  input: unknown,
  index: number,
): { ok: true; value: FicheDefinition } | { ok: false; error: string } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: `Fiche ${index + 1} invalide` };
  }
  const raw = input as Record<string, unknown>;
  const key = text(raw.key);
  const label = text(raw.label);
  const renderTemplate = text(raw.renderTemplate);
  if (!FICHE_KEY_PATTERN.test(key)) {
    return { ok: false, error: `Clé de fiche invalide (${key || "vide"})` };
  }
  const validated = validateTemplateDefinition({
    key,
    label,
    description: text(raw.description),
    systemPrompt: "validation",
    fields: raw.fields,
    renderTemplate,
  });
  if (!validated.ok) {
    return {
      ok: false,
      error: `Fiche « ${label || key} » : ${validated.errors.join(" ; ")}`,
    };
  }
  return {
    ok: true,
    value: {
      key,
      label: validated.value.label,
      description: validated.value.description,
      intent: text(raw.intent),
      fields: validated.value.fields,
      renderTemplate: validated.value.renderTemplate,
      instructions: text(raw.instructions).slice(0, 4000),
      ...(text(raw.sourceFicheId) === ""
        ? {}
        : {
            sourceFicheId: text(raw.sourceFicheId),
            ...(typeof raw.sourceVersion === "number" && raw.sourceVersion >= 1
              ? { sourceVersion: raw.sourceVersion }
              : {}),
          }),
    },
  };
}

export function parseChatbotConfig(
  input: unknown,
): { ok: true; value: ChatbotConfigInput } | { ok: false; errors: string[] } {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Configuration invalide"] };
  }
  const raw = input as Record<string, unknown>;
  const errors: string[] = [];
  const rawBehaviorMode = raw.behaviorMode;
  if (rawBehaviorMode !== undefined && !isChatbotBehaviorMode(rawBehaviorMode)) {
    errors.push("Mode de comportement invalide (guided ou expert)");
  }
  const behaviorMode: ChatbotBehaviorMode = isChatbotBehaviorMode(rawBehaviorMode)
    ? rawBehaviorMode
    : DEFAULT_CHATBOT_BEHAVIOR_MODE;
  const simple = normalizeTemplateSimpleSettings(raw.simple);
  if (simple === null) errors.push("Réglages simples invalides");
  let systemPrompt = text(raw.systemPrompt);
  if (behaviorMode === "guided") {
    // En guidé, les réglages simples sont la seule source : le prompt est un snapshot.
    if (simple !== null) systemPrompt = buildGuidedChatbotPrompt(simple);
  } else if (systemPrompt === "") {
    errors.push("Prompt système obligatoire en mode expert");
  }
  if (!Array.isArray(raw.fiches)) {
    errors.push("Liste de fiches de collecte invalide");
  }
  const fiches: FicheDefinition[] = [];
  const keys = new Set<string>();
  if (Array.isArray(raw.fiches)) {
    if (raw.fiches.length > MAX_FICHES_PER_CHATBOT) {
      errors.push(`${MAX_FICHES_PER_CHATBOT} fiches de collecte maximum`);
    }
    raw.fiches.slice(0, MAX_FICHES_PER_CHATBOT).forEach((entry, index) => {
      const parsed = parseFiche(entry, index);
      if (!parsed.ok) {
        errors.push(parsed.error);
        return;
      }
      if (keys.has(parsed.value.key)) {
        errors.push(`Clé de fiche en double : ${parsed.value.key}`);
        return;
      }
      keys.add(parsed.value.key);
      fiches.push(parsed.value);
    });
  }
  const parsedSelection = parseChatbotDataSelection(raw.dataSelection);
  if (!parsedSelection.ok) errors.push(parsedSelection.error);
  const parsedFallback = parseChatbotFallback(raw.fallback);
  if (!parsedFallback.ok) errors.push(parsedFallback.error);
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      behaviorMode,
      systemPrompt,
      simple: simple as TemplateSimpleSettings,
      fiches,
      dataSelection: parsedSelection.ok ? parsedSelection.value : defaultChatbotDataSelection(),
      fallback: parsedFallback.ok ? parsedFallback.value : defaultChatbotFallback(),
    },
  };
}
