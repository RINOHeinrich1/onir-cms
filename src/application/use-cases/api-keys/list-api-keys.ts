import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { ApiKeyRepository } from "@/application/ports/api-key-repository";
import type { ApiKey } from "@/domain/entities/api-key";

export async function listApiKeys(
  deps: { apiKeys: ApiKeyRepository },
  actor: Actor,
): Promise<ApiKey[]> {
  assertCan(actor, "api_keys:list");
  return deps.apiKeys.list(organizationOf(actor));
}
