/**
 * Limiteurs des endpoints publics de chat (B033) — anti-abus.
 * Limites **paramétrables par variables d'environnement** (défauts sûrs).
 */

import { createRateLimiter } from "@/lib/rate-limit";

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Démarrage de conversation : par **IP + lien** (clé posée côté route), défaut 20 / 10 min. */
export const chatSessionLimiter = createRateLimiter({
  limit: envInt("CHAT_SESSION_LIMIT", 20),
  windowMs: envInt("CHAT_SESSION_WINDOW_MS", 10 * 60 * 1000),
});

/** Messages : par conversation, défaut 20 / 5 min. */
export const chatMessageLimiter = createRateLimiter({
  limit: envInt("CHAT_MESSAGE_LIMIT", 20),
  windowMs: envInt("CHAT_MESSAGE_WINDOW_MS", 5 * 60 * 1000),
});

/** Fallback heuristique (ADR-0059) : par IP + conversation, défaut 30 / 5 min. */
export const chatFallbackLimiter = createRateLimiter({
  limit: envInt("CHAT_FALLBACK_LIMIT", 30),
  windowMs: envInt("CHAT_FALLBACK_WINDOW_MS", 5 * 60 * 1000),
});

/** Upload de pièces jointes (ADR-0034) : par **IP + conversation**, 20 / 5 min. */
export const chatAttachmentLimiter = createRateLimiter({
  limit: envInt("CHAT_ATTACHMENT_LIMIT", 20),
  windowMs: envInt("CHAT_ATTACHMENT_WINDOW_MS", 5 * 60 * 1000),
});

/** Polling/SSE de secours : par IP + conversation, défaut 120 / 1 min. */
export const chatPollLimiter = createRateLimiter({
  limit: envInt("CHAT_POLL_LIMIT", 120),
  windowMs: envInt("CHAT_POLL_WINDOW_MS", 60 * 1000),
});

/** Recherche de médias : par conversation, défaut 30 / 5 min. */
export const chatMediaLimiter = createRateLimiter({
  limit: envInt("CHAT_MEDIA_LIMIT", 30),
  windowMs: envInt("CHAT_MEDIA_WINDOW_MS", 5 * 60 * 1000),
});

/**
 * Ressources de données des templates (ADR-0026) : par **IP + lien**,
 * défaut 60 / 1 min (le cache serveur absorbe les répétitions).
 */
export const templateDataLimiter = createRateLimiter({
  limit: envInt("TEMPLATE_DATA_LIMIT", 60),
  windowMs: envInt("TEMPLATE_DATA_WINDOW_MS", 60 * 1000),
});

/**
 * Détection de l'état du visiteur (ADR-0020) : par **IP + conversation**,
 * défaut 30 / 5 min. Réutilise le même garde-fou que les autres routes chat.
 */
export const chatStateLimiter = createRateLimiter({
  limit: envInt("CHAT_STATE_LIMIT", 30),
  windowMs: envInt("CHAT_STATE_WINDOW_MS", 5 * 60 * 1000),
});
