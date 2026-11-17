import type { Pool } from "pg";
import type {
  VisualTemplateAuditInput,
  VisualTemplateAuditRepository,
} from "@/application/ports/visual-template-audit-repository";

/** Journal append-only des actions templates (ADR-0090). */
export function pgVisualTemplateAuditRepository(pool: Pool): VisualTemplateAuditRepository {
  return {
    async record(input: VisualTemplateAuditInput): Promise<void> {
      await pool.query(
        `INSERT INTO visual_template_audit
           (organization_id, template_id, actor_id, event, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          input.organizationId,
          input.templateId,
          input.actorId,
          input.event,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    },
  };
}
