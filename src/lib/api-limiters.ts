/**
 * Limiteurs de l'API publique server-to-server.
 * En mémoire : suffisant pour l'instance unique actuelle. À remplacer par
 * Redis/Postgres si l'application est répliquée.
 */

import { createRateLimiter } from "@/lib/rate-limit";

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export const apiKeyMinuteLimiter = createRateLimiter({
  limit: envInt("API_KEY_RATE_LIMIT", 60),
  windowMs: 60 * 1000,
});

export const apiKeyHourLimiter = createRateLimiter({
  limit: envInt("API_KEY_HOURLY_LIMIT", 1000),
  windowMs: 60 * 60 * 1000,
});
