import { createHash, randomBytes } from "node:crypto";

/**
 * Jeton de session : génération opaque et empreinte SHA-256.
 * Utilise `node:crypto` (runtime Node uniquement, jamais le middleware Edge).
 */

/** Jeton opaque de session (jamais stocké en clair côté base). */
export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Empreinte SHA-256 du jeton, seule valeur persistée. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
