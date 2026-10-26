/**
 * Clé d'API server-to-server (B0xx) — portée organisation.
 * Le secret n'est jamais persisté ; seuls le préfixe et le hash le sont.
 */

export const API_KEY_SCOPES = ["fiches:read"] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === "string" && (API_KEY_SCOPES as readonly string[]).includes(value);
}

export type ApiKey = {
  id: string;
  organizationId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  createdBy: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
};

/** Vue interne d'authentification : inclut l'empreinte scrypt (jamais exposée). */
export type ApiKeyWithHash = ApiKey & { keyHash: string };

export type ApiKeyStatus = "active" | "expired" | "revoked";

export function apiKeyStatus(key: ApiKey, now = Date.now()): ApiKeyStatus {
  if (key.revokedAt !== null) return "revoked";
  if (key.expiresAt !== null && new Date(key.expiresAt).getTime() <= now) return "expired";
  return "active";
}
