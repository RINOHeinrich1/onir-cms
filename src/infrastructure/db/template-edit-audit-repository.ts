import type { Pool } from "pg";
import type {
  TemplateEditAuditInput,
  TemplateEditAuditRecord,
  TemplateEditAuditRepository,
} from "@/application/ports/template-edit-audit-repository";

type Row = {
  id: string;
  organization_id: string;
  link_id: string;
  session_id: string;
  message_id: string | null;
  actor_id: string | null;
  event: TemplateEditAuditRecord["event"];
  template_id: string | null;
  template_version: string | null;
  candidate_id: string | null;
  content: string | null;
  operations: unknown;
  warnings: string[] | null;
  before_hash: string | null;
  after_hash: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function mapRow(row: Row): TemplateEditAuditRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    linkId: row.link_id,
    sessionId: row.session_id,
    messageId: row.message_id,
    actorId: row.actor_id,
    event: row.event,
    templateId: row.template_id,
    templateVersion: row.template_version,
    candidateId: row.candidate_id,
    content: row.content,
    operations: row.operations,
    warnings: row.warnings ?? [],
    beforeHash: row.before_hash,
    afterHash: row.after_hash,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

const SELECT = `SELECT id, organization_id, link_id, session_id, message_id, actor_id,
                       event, template_id, template_version, candidate_id, content,
                       operations, warnings, before_hash, after_hash, metadata, created_at
                  FROM template_edit_audit_events`;

export function pgTemplateEditAuditRepository(pool: Pool): TemplateEditAuditRepository {
  return {
    async record(input: TemplateEditAuditInput): Promise<void> {
      await pool.query(
        `INSERT INTO template_edit_audit_events
           (organization_id, link_id, session_id, message_id, actor_id, event,
            template_id, template_version, candidate_id, content, operations,
            warnings, before_hash, after_hash, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          input.organizationId,
          input.linkId,
          input.sessionId,
          input.messageId ?? null,
          input.actorId,
          input.event,
          input.templateId ?? null,
          input.templateVersion ?? null,
          input.candidateId ?? null,
          input.content ?? null,
          JSON.stringify(input.operations ?? null),
          JSON.stringify(input.warnings ?? []),
          input.beforeHash ?? null,
          input.afterHash ?? null,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
    },

    async listBySession(organizationId, linkId, sessionId) {
      const result = await pool.query<Row>(
        `${SELECT}
          WHERE organization_id = $1 AND link_id = $2 AND session_id = $3
          ORDER BY created_at ASC, id ASC`,
        [organizationId, linkId, sessionId],
      );
      return result.rows.map(mapRow);
    },
  };
}
