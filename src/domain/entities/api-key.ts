/**
 * Clé d'API server-to-server (B0xx) — portée organisation.
 * Le secret n'est jamais persisté ; seuls le préfixe et le hash le sont.
 */

export const API_KEY_SCOPES = [
  "fiches:read",
  "fiches:write",
  "prospects:read",
  "prospects:write",
  "conversations:read",
  "conversations:write",
  "chatbots:read",
  "chatbots:write",
  "modeles:read",
  "webhooks:read",
  "webhooks:write",
  "statistiques:read",
] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export const API_KEY_SCOPE_LABELS: Record<ApiKeyScope, string> = {
  "fiches:read": "Lire les fiches",
  "fiches:write": "Archiver les fiches",
  "prospects:read": "Lire les prospects",
  "prospects:write": "Créer/modifier les prospects",
  "conversations:read": "Lire les conversations",
  "conversations:write": "Clôturer les conversations",
  "chatbots:read": "Lire les chatbots",
  "chatbots:write": "Créer/modifier les chatbots",
  "modeles:read": "Lire les modèles",
  "webhooks:read": "Lire les webhooks",
  "webhooks:write": "Gérer les webhooks",
  "statistiques:read": "Lire les statistiques",
};

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return typeof value === "string" && (API_KEY_SCOPES as readonly string[]).includes(value);
}

export type ApiKeyScopeParseResult =
  | { ok: true; scopes: ApiKeyScope[] }
  | { ok: false; message: string };

/** Normalise une liste de scopes (dédupliquée, ordre conservé). */
export function parseApiKeyScopes(value: unknown): ApiKeyScopeParseResult {
  if (value === undefined) return { ok: true, scopes: ["fiches:read"] };
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, message: "Au moins un scope est requis" };
  }
  const scopes: ApiKeyScope[] = [];
  for (const entry of value) {
    if (!isApiKeyScope(entry)) return { ok: false, message: "Scope invalide" };
    if (!scopes.includes(entry)) scopes.push(entry);
  }
  return { ok: true, scopes };
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
