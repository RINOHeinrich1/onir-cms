import type { TemplateField } from "@/domain/entities/chat-template";
import { buildDefaultSystemPrompt } from "@/domain/template-defaults";
import { validateTemplateDefinition } from "@/domain/template-schema";
import {
  normalizeTemplateSimpleSettings,
  type TemplateSimpleSettings,
} from "@/domain/template-settings";

export const MAX_FICHES_PER_CHATBOT = 8;
const FICHE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export type ChatbotConfigInput = {
  /** Mode guidé (réglages simples) ou expert (prompt libre). */
  behaviorMode: ChatbotBehaviorMode;
  /** Prompt effectif stocké en snapshot (généré en guidé, saisi en expert). */
  systemPrompt: string;
  simple: TemplateSimpleSettings;
  fiches: FicheDefinition[];
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
  if (!Array.isArray(raw.fiches) || raw.fiches.length === 0) {
    errors.push("Au moins une fiche de collecte est obligatoire");
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
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      behaviorMode,
      systemPrompt,
      simple: simple as TemplateSimpleSettings,
      fiches,
    },
  };
}
