import { UnauthorizedError } from "@/application/errors";
import type { ApiKeyAuditRepository } from "@/application/ports/api-key-audit-repository";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import { type ApiKey, type ApiKeyStatus, apiKeyStatus } from "@/domain/entities/api-key";
import { parseApiKey, verifyApiKeySecret } from "@/lib/api-key-token";

export type AuthenticatedApiKey = {
  key: ApiKey;
  organizationId: string;
  scopes: ApiKey["scopes"];
};

function parseBearer(header: string | null): string | null {
  if (header === null) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? null;
}

function invalid(status: ApiKeyStatus): never {
  if (status === "revoked") throw new UnauthorizedError("Clé d’API révoquée");
  if (status === "expired") throw new UnauthorizedError("Clé d’API expirée");
  throw new UnauthorizedError();
}

export async function authenticateApiKey(
  deps: {
    apiKeys: ApiKeyRepository;
    organizations: OrganizationRepository;
    audit: ApiKeyAuditRepository;
  },
  authorization: string | null,
  meta: { ip: string | null; userAgent: string | null },
): Promise<AuthenticatedApiKey> {
  const token = parseBearer(authorization);
  const parsed = token === null ? null : parseApiKey(token);
  if (parsed === null) throw new UnauthorizedError("Clé d’API requise");
  const key = await deps.apiKeys.findByPrefix(parsed.prefix);
  if (key === null || !(await verifyApiKeySecret(parsed.secret, key.keyHash))) {
    throw new UnauthorizedError("Clé d’API invalide");
  }

  const status = apiKeyStatus(key);
  if (status !== "active") {
    await deps.audit
      .record({
        apiKeyId: key.id,
        organizationId: key.organizationId,
        event: "auth_failed",
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: status },
      })
      .catch(() => undefined);
    invalid(status);
  }

  const organization = await deps.organizations.findById(key.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    await deps.audit
      .record({
        apiKeyId: key.id,
        organizationId: key.organizationId,
        event: "auth_failed",
        ip: meta.ip,
        userAgent: meta.userAgent,
        metadata: { reason: "organization_suspended" },
      })
      .catch(() => undefined);
    throw new UnauthorizedError("Clé d’API invalide");
  }

  await deps.apiKeys.touchLastUsed(key.id, meta.ip).catch(() => undefined);
  return { key, organizationId: key.organizationId, scopes: key.scopes };
}
