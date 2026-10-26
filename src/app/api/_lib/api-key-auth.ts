import type { AuthenticatedApiKey } from "@/application/use-cases/api-keys/authenticate-api-key";
import { authenticateApiKey } from "@/application/use-cases/api-keys/authenticate-api-key";
import { pgApiKeyAuditRepository } from "@/infrastructure/db/api-key-audit-repository";
import { pgApiKeyRepository } from "@/infrastructure/db/api-key-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { clientIp } from "./http";

/** Authentifie une requête API via `Authorization: Bearer <clé>`. */
export async function authenticateApiRequest(request: Request): Promise<AuthenticatedApiKey> {
  const pool = getPool();
  return authenticateApiKey(
    {
      apiKeys: pgApiKeyRepository(pool),
      organizations: pgOrganizationRepository(pool),
      audit: pgApiKeyAuditRepository(pool),
    },
    request.headers.get("authorization"),
    {
      ip: clientIp(request) === "unknown" ? null : clientIp(request),
      userAgent: request.headers.get("user-agent"),
    },
  );
}
