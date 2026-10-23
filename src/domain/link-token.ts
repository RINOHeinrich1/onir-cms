/**
 * Jetons de liens de chat partageables (B016).
 * Le jeton en clair n'est JAMAIS persisté : seul son hash SHA-256 est stocké,
 * le clair n'est communiqué qu'une fois, à la création.
 */

import { createHash, randomBytes } from "node:crypto";

/** JetonURL opaque (24 octets → 32 caractères base64url). */
export function generateLinkToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Empreinte SHA-256 hex d'un jeton (ce qui est stocké en base). */
export function hashLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
