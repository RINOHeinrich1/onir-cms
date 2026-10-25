import { createHmac, timingSafeEqual } from "node:crypto";
import { sessionSecret } from "@/lib/env";

/** Jetons d'accès public aux pièces jointes (ADR-0034). Durée : 1 heure. */
export const ATTACHMENT_TOKEN_TTL_MS = 60 * 60 * 1000;

function signature(attachmentId: string, organizationId: string, expiresAt: number): string {
  return createHmac("sha256", sessionSecret())
    .update(`${attachmentId}.${organizationId}.${expiresAt}`)
    .digest("base64url");
}

export function signAttachmentAccess(
  attachmentId: string,
  organizationId: string,
  ttlMs = ATTACHMENT_TOKEN_TTL_MS,
): string {
  const expiresAt = Date.now() + ttlMs;
  return `${expiresAt}.${signature(attachmentId, organizationId, expiresAt)}`;
}

export function verifyAttachmentAccess(
  token: string,
  attachmentId: string,
  organizationId: string,
): boolean {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const expiresAt = Number(token.slice(0, separator));
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const provided = Buffer.from(token.slice(separator + 1));
  const expected = Buffer.from(signature(attachmentId, organizationId, expiresAt));
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}

/** URL publique signée d'une pièce jointe. */
export function signedAttachmentUrl(attachmentId: string, organizationId: string): string {
  return `/api/chat/attachments/${attachmentId}/file?t=${signAttachmentAccess(
    attachmentId,
    organizationId,
  )}`;
}

/** URL dashboard (session) d'une pièce jointe. */
export function dashboardAttachmentUrl(attachmentId: string): string {
  return `/api/chat/attachments/${attachmentId}/file?inline=1`;
}
