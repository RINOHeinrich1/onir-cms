import type { Pool } from "pg";
import type {
  TemplateDataAuditEntry,
  TemplateDataAuditRepository,
} from "@/application/ports/template-data-audit-repository";

export function pgTemplateDataAuditRepository(pool: Pool): TemplateDataAuditRepository {
  return {
    async record(entry: TemplateDataAuditEntry): Promise<void> {
      await pool.query(
        `INSERT INTO template_data_audit
           (organization_id, chat_link_id, template_version_id, contract_key, binding_id,
            cache_hit, duration_ms, row_count, byte_count, outcome, error_code)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          entry.organizationId,
          entry.linkId,
          entry.templateVersionId,
          entry.contractKey,
          entry.bindingId,
          entry.cacheHit,
          entry.durationMs,
          entry.rowCount,
          entry.byteCount,
          entry.outcome,
          entry.errorCode,
        ],
      );
    },
  };
}
