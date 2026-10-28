import type { AiClient, AiMessage } from "@/application/ports/ai-client";
import {
  isUserState,
  NEUTRAL_DETECTION,
  USER_STATE_INSTRUCTION,
  type UserStateDetection,
} from "@/domain/entities/user-state";

export type DetectUserStateDependencies = {
  ai: AiClient;
};

export type DetectUserStateInput = {
  /** Message courant du visiteur (sujet de la classification). */
  content: unknown;
  /** Historique récent borné (tours précédents), facultatif. */
  history?: ReadonlyArray<{ role: string; content: string }>;
};

/** Nombre de tours d'historique transmis à la classification (borne le coût). */
const HISTORY_LIMIT = 6;

/** Garde l'historique aux seuls rôles du chat et aux derniers tours. */
function recentHistory(history: DetectUserStateInput["history"]): AiMessage[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (message): message is { role: "user" | "assistant"; content: string } =>
        (message.role === "user" || message.role === "assistant" || message.role === "operator") &&
        typeof message.content === "string",
    )
    .slice(-HISTORY_LIMIT)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));
}

/**
 * Interprète la sortie IA : JSON strict `{ state, confidence }`.
 * Toute réponse non conforme ⇒ échec de parsing (appelant → fail-open).
 */
function parseDetection(raw: string): UserStateDetection | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const record = parsed as Record<string, unknown>;
  const state = record.state;
  const confidence = record.confidence;
  if (typeof state !== "string" || !isUserState(state)) return null;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) return null;
  return { state, confidence: Math.max(0, Math.min(1, confidence)) };
}

/**
 * Capacité cœur « état du visiteur » (ADR-0020).
 *
 * **Fail-open** : toute erreur d'IA ou réponse non conforme renvoie
 * `{ state: "neutral", confidence: 0 }`. Cette fonction **ne lève jamais** —
 * la classification ne doit jamais bloquer le chat.
 */
export async function detectUserState(
  deps: DetectUserStateDependencies,
  input: DetectUserStateInput,
): Promise<UserStateDetection> {
  const content = typeof input.content === "string" ? input.content.trim() : "";
  if (content === "") return { ...NEUTRAL_DETECTION };

  let raw: string;
  try {
    raw = await deps.ai.complete({
      system: USER_STATE_INSTRUCTION,
      messages: [...recentHistory(input.history), { role: "user", content }],
      maxTokens: 60,
    });
  } catch {
    return { ...NEUTRAL_DETECTION };
  }

  return parseDetection(raw) ?? { ...NEUTRAL_DETECTION };
}
