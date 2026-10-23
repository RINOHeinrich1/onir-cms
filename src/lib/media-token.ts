import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "@/lib/env";

/**
 * Jetons d'accès public aux fichiers médias (ADR-0025, H8).
 * Le visiteur public n'a pas de session : l'URL signée (HMAC courte durée)
 * porte la capability et l'organisation, sans qu'aucun `organizationId` client
 * ne soit accepté. Durée par défaut : 1 heure.
 */
export const MEDIA_TOKEN_TTL_MS = 60 * 60 * 1000;

function signature(mediaId: string, organizationId: string, expiresAt: number): string {
  return createHmac("sha256", sessionSecret())
    .update(`${mediaId}.${organizationId}.${expiresAt}`)
    .digest("base64url");
}

/** Génère un jeton `expiration.signature` pour (média, organisation). */
export function signMediaAccess(
  mediaId: string,
  organizationId: string,
  ttlMs = MEDIA_TOKEN_TTL_MS,
): string {
  const expiresAt = Date.now() + ttlMs;
  return `${expiresAt}.${signature(mediaId, organizationId, expiresAt)}`;
}

/** Vérifie un jeton pour (média, organisation) ; faux si invalide/expiré. */
export function verifyMediaAccess(token: string, mediaId: string, organizationId: string): boolean {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const expiresRaw = token.slice(0, separator);
  const provided = token.slice(separator + 1);
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = signature(mediaId, organizationId, expiresAt);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** URL interne signée d'une photo (utilisée par le parcours public). */
export function signedMediaUrl(mediaId: string, organizationId: string): string {
  return `/api/medias/${mediaId}/file?t=${signMediaAccess(mediaId, organizationId)}`;
}
