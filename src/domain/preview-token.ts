/**
 * Jetons de session d'aperçu (ADR-0104).
 * Le jeton clair n'est jamais persisté : seul son SHA-256 est stocké.
 */
import { createHash, randomBytes } from "node:crypto";

export function generatePreviewToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashPreviewToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
