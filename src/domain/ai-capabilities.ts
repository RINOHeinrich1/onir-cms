import type { AiProviderPreset } from "@/domain/entities/ai-provider";

export const REASONING_MODES = ["auto", "enabled", "disabled"] as const;
export type ReasoningMode = (typeof REASONING_MODES)[number];

export type ReasoningControl =
  | "none"
  | "infomaniak_chat_template"
  | "openai_reasoning_effort"
  | "openrouter_reasoning";

export const REASONING_PROFILES = [
  "auto",
  "none",
  "infomaniak_chat_template",
  "openai_reasoning_effort",
  "openrouter_reasoning",
] as const;

export type ReasoningProfile = (typeof REASONING_PROFILES)[number];

export const REASONING_PROFILE_LABELS: Record<ReasoningProfile, string> = {
  auto: "Auto (selon le type de fournisseur)",
  none: "Aucun paramètre de raisonnement",
  infomaniak_chat_template: "vLLM / Infomaniak (enable_thinking)",
  openai_reasoning_effort: "OpenAI reasoning (reasoning_effort)",
  openrouter_reasoning: "OpenRouter (reasoning.effort)",
};

export function isReasoningProfile(value: unknown): value is ReasoningProfile {
  return (REASONING_PROFILES as readonly string[]).includes(String(value));
}

export function parseReasoningProfile(value: unknown): ReasoningProfile | null {
  return isReasoningProfile(value) ? value : null;
}

export type StructuredOutputMode = "json_object" | "prompt";

export type AiCapabilities = {
  /** Stratégie native de contrôle du raisonnement, `none` si non supporté. */
  reasoningControl: ReasoningControl;
  /** L'admin peut exposer un choix Auto/Activé/Désactivé. */
  supportsReasoningToggle: boolean;
  /** Mode structuré natif utilisable par défaut ; le prompt reste le fallback. */
  structuredOutput: StructuredOutputMode;
};

export function isReasoningMode(value: unknown): value is ReasoningMode {
  return value === "auto" || value === "enabled" || value === "disabled";
}

export function parseReasoningMode(value: unknown): ReasoningMode | null {
  return isReasoningMode(value) ? value : null;
}

const REASONING_MODEL_PATTERN = /^(o[1-9]|gpt-5|gpt-6|deepseek-reasoner|qwen\/|google\/gemma)/i;

/** Capacités déclaratives par preset ; extensible sans toucher au cœur métier. */
export function aiCapabilitiesFor(
  preset: AiProviderPreset,
  modelId: string,
  profile?: ReasoningProfile | null,
): AiCapabilities {
  if (profile !== undefined && profile !== null && profile !== "auto") {
    if (profile === "none") {
      return {
        reasoningControl: "none",
        supportsReasoningToggle: false,
        structuredOutput: "prompt",
      };
    }
    if (profile === "infomaniak_chat_template") {
      return {
        reasoningControl: "infomaniak_chat_template",
        supportsReasoningToggle: true,
        structuredOutput: "prompt",
      };
    }
    if (profile === "openai_reasoning_effort") {
      return {
        reasoningControl: "openai_reasoning_effort",
        supportsReasoningToggle: true,
        structuredOutput: "json_object",
      };
    }
    return {
      reasoningControl: "openrouter_reasoning",
      supportsReasoningToggle: true,
      structuredOutput: "json_object",
    };
  }
  if (preset === "infomaniak") {
    return {
      reasoningControl: "infomaniak_chat_template",
      supportsReasoningToggle: true,
      structuredOutput: "prompt",
    };
  }
  if (preset === "openai") {
    const reasoning = REASONING_MODEL_PATTERN.test(modelId);
    return {
      reasoningControl: reasoning ? "openai_reasoning_effort" : "none",
      supportsReasoningToggle: reasoning,
      structuredOutput: "json_object",
    };
  }
  if (preset === "openrouter") {
    return {
      reasoningControl: "openrouter_reasoning",
      supportsReasoningToggle: true,
      structuredOutput: "json_object",
    };
  }
  if (preset === "deepseek") {
    return {
      reasoningControl: "none",
      supportsReasoningToggle: false,
      structuredOutput: "json_object",
    };
  }
  return {
    reasoningControl: "none",
    supportsReasoningToggle: false,
    structuredOutput: "prompt",
  };
}

/** Un modèle peut-il être proposé comme moteur d'extraction fiable ? */
export function supportsStructuredExtraction(preset: AiProviderPreset, modelId: string): boolean {
  return (
    aiCapabilitiesFor(preset, modelId).structuredOutput === "json_object" || preset === "infomaniak"
  );
}
