import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import type { ApiKeyAuditRepository } from "@/application/ports/api-key-audit-repository";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import type { ApiKey, ApiKeyScope } from "@/domain/entities/api-key";
import { API_KEY_SCOPES } from "@/domain/entities/api-key";
import { generateApiKey, hashApiKeySecret } from "@/lib/api-key-token";

export type CreateApiKeyDependencies = {
  apiKeys: ApiKeyRepository;
  audit: ApiKeyAuditRepository;
};

export type CreateApiKeyInput = {
  name: unknown;
  expiresInDays: unknown;
};

export type CreatedApiKey = {
  key: ApiKey;
  secret: string;
};

function parseName(value: unknown): string {
  if (typeof value !== "string") throw new ValidationError("Le nom de la clé est requis");
  const name = value.trim();
  if (name.length < 2 || name.length > 120) {
    throw new ValidationError("Le nom doit contenir entre 2 et 120 caractères");
  }
  return name;
}

function parseExpiry(value: unknown): string | null {
  if (value === undefined || value === null || value === "" || value === 0) return null;
  const days = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 3650) {
    throw new ValidationError("Expiration invalide");
  }
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

export async function createApiKey(
  deps: CreateApiKeyDependencies,
  actor: Actor,
  input: CreateApiKeyInput,
  meta: { ip: string | null; userAgent: string | null },
): Promise<CreatedApiKey> {
  assertCan(actor, "api_keys:create");
  const organizationId = organizationOf(actor);
  const name = parseName(input.name);
  const expiresAt = parseExpiry(input.expiresInDays);
  const generated = generateApiKey();
  const key = await deps.apiKeys.create(organizationId, {
    name,
    keyPrefix: generated.prefix,
    keyHash: await hashApiKeySecret(generated.secret),
    scopes: [...API_KEY_SCOPES] as ApiKeyScope[],
    createdBy: actor.id,
    expiresAt,
  });
  await deps.audit.record({
    apiKeyId: key.id,
    organizationId,
    event: "created",
    ip: meta.ip,
    userAgent: meta.userAgent,
    metadata: { name: key.name, scopes: key.scopes, expiresAt: key.expiresAt },
  });
  return { key, secret: generated.token };
}
