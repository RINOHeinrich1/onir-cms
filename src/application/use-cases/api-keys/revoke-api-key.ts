import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ApiKeyAuditRepository } from "@/application/ports/api-key-audit-repository";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import type { ApiKey } from "@/domain/entities/api-key";

export async function revokeApiKey(
  deps: { apiKeys: ApiKeyRepository; audit: ApiKeyAuditRepository },
  actor: Actor,
  id: string,
  meta: { ip: string | null; userAgent: string | null },
): Promise<ApiKey> {
  assertCan(actor, "api_keys:revoke");
  const organizationId = organizationOf(actor);
  const key = await deps.apiKeys.revoke(organizationId, id);
  if (key === null) throw new NotFoundError("Clé introuvable");
  await deps.audit.record({
    apiKeyId: key.id,
    organizationId,
    event: "revoked",
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return key;
}
