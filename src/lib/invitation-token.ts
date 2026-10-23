import { createHash, randomBytes } from "node:crypto";

/** Jeton d'invitation opaque (jamais stocké en clair). */
export function createInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Empreinte SHA-256 utilisée comme clé de recherche. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
