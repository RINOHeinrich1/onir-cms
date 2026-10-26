import type { Pool } from "pg";
import type {
  ApiKeyAuditEvent,
  ApiKeyAuditRepository,
} from "@/application/ports/api-key-audit-repository";

/** Journal append-only des événements sensibles des clés d'API. */
export function pgApiKeyAuditRepository(pool: Pool): ApiKeyAuditRepository {
  return {
    async record(input: {
      apiKeyId: string;
      organizationId: string;
      event: ApiKeyAuditEvent;
      ip: string | null;
      userAgent: string | null;
      metadata?: Record<string, unknown>;
    }) {
      await pool.query(
        `INSERT INTO api_key_audit
           (api_key_id, organization_id, event, ip, user_agent, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          input.apiKeyId,
          input.organizationId,
          input.event,
          input.ip === "unknown" ? null : input.ip,
          input.userAgent,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    },
  };
}
