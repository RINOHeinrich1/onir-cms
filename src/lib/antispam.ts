/**
 * Garde anti-spam temporelle (time-trap) pour les formulaires publics.
 * Un humain lit puis remplit (≥ `MIN_HUMAN_DELAY_MS`) ; un bot poste
 * instantanément. Aucun champ à remplir ⇒ insensible à l'autofill
 * (contrairement au honeypot, retiré pour faux positifs constatés).
 * Complète le rate limiting, ne le remplace pas.
 */

export const MIN_HUMAN_DELAY_MS = 1500;

/** `loadedAt` plausible : passé récent, jamais dans le futur (+60 s de tolérance). */
export function isPlausibleTiming(loadedAt: unknown, now: number): boolean {
  return (
    typeof loadedAt === "number" &&
    Number.isFinite(loadedAt) &&
    loadedAt <= now + 60_000 &&
    now - loadedAt >= MIN_HUMAN_DELAY_MS
  );
}
