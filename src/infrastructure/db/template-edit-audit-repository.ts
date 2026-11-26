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
  turn_id: string | null;
  actor_id: string | null;
  event: TemplateEditAuditRecord["event"];
  stage: string | null;
  template_id: string | null;
  template_version: string | null;
  candidate_id: string | null;
  content: string | null;
  operations: unknown;
  warnings: string[] | null;
  before_hash: string | null;
  after_hash: string | null;
  raw_response: unknown;
  validation_errors: string[] | null;
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
    turnId: row.turn_id,
    actorId: row.actor_id,
    event: row.event,
    stage: row.stage,
    templateId: row.template_id,
    templateVersion: row.template_version,
    candidateId: row.candidate_id,
    content: row.content,
    operations: row.operations,
    warnings: row.warnings ?? [],
    beforeHash: row.before_hash,
    afterHash: row.after_hash,
    rawResponse: row.raw_response,
    validationErrors: row.validation_errors ?? [],
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  };
}

const SELECT = `SELECT id, organization_id, link_id, session_id, message_id, turn_id, actor_id,
                       event, stage, template_id, template_version, candidate_id, content,
                       operations, warnings, before_hash, after_hash, raw_response,
                       validation_errors, metadata, created_at
                  FROM template_edit_audit_events`;

export function pgTemplateEditAuditRepository(pool: Pool): TemplateEditAuditRepository {
  return {
    async record(input: TemplateEditAuditInput): Promise<void> {
      await pool.query(
        `INSERT INTO template_edit_audit_events
           (organization_id, link_id, session_id, message_id, turn_id, actor_id, event, stage,
            template_id, template_version, candidate_id, content, operations,
            warnings, before_hash, after_hash, raw_response, validation_errors, metadata)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
        [
          input.organizationId,
          input.linkId,
          input.sessionId,
          input.messageId ?? null,
          input.turnId ?? null,
          input.actorId,
          input.event,
          input.stage ?? null,
          input.templateId ?? null,
          input.templateVersion ?? null,
          input.candidateId ?? null,
          input.content ?? null,
          JSON.stringify(input.operations ?? null),
          JSON.stringify(input.warnings ?? []),
          input.beforeHash ?? null,
          input.afterHash ?? null,
          JSON.stringify(input.rawResponse ?? null),
          JSON.stringify(input.validationErrors ?? []),
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
