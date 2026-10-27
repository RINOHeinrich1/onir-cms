/**
 * Réglages du mode Simple d'un modèle de raisonnement.
 * Ils sont conservés dans le snapshot de définition pour pouvoir être
 * rechargés à l'édition et pour piloter le rappel de langue au runtime.
 */

export type TemplateLanguagePolicy = { mode: "auto" } | { mode: "fixed"; value: string };

export type TemplateSimpleSettings = {
  role: string;
  objective: string;
  language: TemplateLanguagePolicy;
  tone: string;
  /** Instructions libres : identifiants de suggestions ou texte personnalisé. */
  guardrails: string[];
  extraInstructions: string;
};

export const DEFAULT_TEMPLATE_LANGUAGE: TemplateLanguagePolicy = { mode: "auto" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

export function normalizeLanguagePolicy(value: unknown): TemplateLanguagePolicy {
  if (typeof value === "string") {
    const language = clip(value.trim(), 80);
    return language === "" || language.toLowerCase() === "auto"
      ? { ...DEFAULT_TEMPLATE_LANGUAGE }
      : { mode: "fixed", value: language };
  }
  if (!isRecord(value)) return { ...DEFAULT_TEMPLATE_LANGUAGE };
  const mode = text(value.mode);
  if (mode === "fixed") {
    const language = clip(text(value.value), 80);
    return language === "" ? { ...DEFAULT_TEMPLATE_LANGUAGE } : { mode: "fixed", value: language };
  }
  return { ...DEFAULT_TEMPLATE_LANGUAGE };
}

/** Normalise les réglages du mode Simple ; `null` si le bloc est absent/invalide. */
export function normalizeTemplateSimpleSettings(value: unknown): TemplateSimpleSettings | null {
  if (!isRecord(value)) return null;
  return {
    role: clip(text(value.role), 200),
    objective: clip(text(value.objective), 2_000),
    language: normalizeLanguagePolicy(value.language),
    tone: clip(text(value.tone), 200),
    guardrails: Array.isArray(value.guardrails)
      ? [
          ...new Set(
            value.guardrails
              .filter((entry): entry is string => typeof entry === "string")
              .map((entry) => clip(entry.trim(), 500))
              .filter((entry) => entry !== ""),
          ),
        ].slice(0, 20)
      : [],
    extraInstructions: clip(text(value.extraInstructions), 4_000),
  };
}

/** Consigne de langue intégrée au prompt du modèle. */
export function languageInstruction(policy: TemplateLanguagePolicy): string {
  if (policy.mode === "auto") {
    return [
      "Tu réponds dans la langue du visiteur.",
      "Si le visiteur change de langue, tu changes aussi.",
      "La langue de ces instructions n'impose pas la langue de réponse.",
      "Traduis les libellés des informations à collecter dans la langue du visiteur dans tes questions, mais conserve les clés techniques pour la fiche interne.",
    ].join(" ");
  }
  return `Tu réponds en ${policy.value}.`;
}

/**
 * Rappel ajouté après les enrichissements runtime (pièces jointes, RAG).
 * Il évite qu'un bloc de contexte en français réancre la conversation.
 */
export function languageReminder(policy: TemplateLanguagePolicy): string {
  if (policy.mode === "auto") {
    return "Rappel : réponds dans la langue du visiteur, quelle que soit la langue de ces instructions ou des informations internes.";
  }
  return `Rappel : réponds en ${policy.value}, quelle que soit la langue de ces instructions ou des informations internes.`;
}
