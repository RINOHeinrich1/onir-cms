/**
 * Capacité cœur « état du visiteur » (ADR-0020) — domaine pur.
 * L'état est déduit du message du visiteur (classification IA) et sert aux
 * templates visuels à refléter une réaction (personnage, ambiance…).
 * `neutral` est la valeur par défaut (fail-open) : jamais bloquant.
 */

export const USER_STATES = ["neutral", "content", "triste"] as const;

export type UserState = (typeof USER_STATES)[number];

export function isUserState(value: unknown): value is UserState {
  return typeof value === "string" && (USER_STATES as readonly string[]).includes(value);
}

/** État neutre par défaut (absence de signal / échec de détection). */
export const DEFAULT_USER_STATE: UserState = "neutral";

/**
 * Normalise une valeur brute (réponse IA, base, contexte) en `UserState`.
 * Toute valeur inconnue ou non conforme retombe sur `neutral`.
 */
export function parseUserState(value: unknown): UserState {
  return typeof value === "string" && isUserState(value) ? value : DEFAULT_USER_STATE;
}

/**
 * Règle de classification de l'état du visiteur, communiquée au LLM.
 * Sortie **JSON stricte** `{ state, confidence }` — aucune autre réponse tolérée.
 */
export const USER_STATE_INSTRUCTION = [
  "Tu classes l'état d'esprit du visiteur à partir de son message.",
  'États possibles : "content" (remercie, salue chaleureusement, exprime de la satisfaction ou un accord), "triste" (exprime une déception, une plainte, de l\'insatisfaction ou de l\'inquiétude), "neutral" (question ou demande sans émotion marquée, cas par défaut).',
  'Réponds UNIQUEMENT avec un objet JSON strict : {"state": "neutral" | "content" | "triste", "confidence": <nombre entre 0 et 1>}.',
  "Aucun autre texte, aucune explication.",
].join("\n");

/** Sortie attendue de la détection : état + niveau de confiance (0..1). */
export type UserStateDetection = {
  state: UserState;
  confidence: number;
};

/** Détection neutre (fail-open) : confiance nulle. */
export const NEUTRAL_DETECTION: UserStateDetection = {
  state: DEFAULT_USER_STATE,
  confidence: 0,
};
