import type { Pool } from "pg";
import type {
  CreateTemplateEditSessionInput,
  TemplateEditSessionRepository,
} from "@/application/ports/template-edit-session-repository";
import type { TemplateEditSession, TemplateEditSessionState } from "@/domain/template-edit-session";

type Row = {
  id: string;
  organization_id: string;
  link_id: string;
  created_by: string | null;
  surface: "page" | "widget";
  template_id: string | null;
  template_version: string | null;
  status: "active" | "archived";
  state: TemplateEditSessionState;
  created_at: string;
  updated_at: string;
};

function mapRow(row: Row): TemplateEditSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    linkId: row.link_id,
    createdBy: row.created_by,
    surface: row.surface,
    templateId: row.template_id,
    templateVersion: row.template_version,
    status: row.status,
    state: row.state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT = `SELECT id, organization_id, link_id, created_by, surface,
                       template_id, template_version, status, state, created_at, updated_at
                  FROM template_edit_sessions`;

export function pgTemplateEditSessionRepository(pool: Pool): TemplateEditSessionRepository {
  return {
    async create(input: CreateTemplateEditSessionInput): Promise<TemplateEditSession> {
      const result = await pool.query<Row>(
        `INSERT INTO template_edit_sessions
           (organization_id, link_id, created_by, surface, template_id, template_version, state)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, organization_id, link_id, created_by, surface,
                   template_id, template_version, status, state, created_at, updated_at`,
        [
          input.organizationId,
          input.linkId,
          input.createdBy,
          input.surface,
          input.templateId,
          input.templateVersion,
          JSON.stringify(input.state),
        ],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("template_edit_session_create_failed");
      return mapRow(row);
    },

    async find(organizationId, linkId, sessionId) {
      const result = await pool.query<Row>(
        `${SELECT} WHERE organization_id = $1 AND link_id = $2 AND id = $3`,
        [organizationId, linkId, sessionId],
      );
      const row = result.rows[0];
      return row === undefined ? null : mapRow(row);
    },

    async findActive(organizationId, linkId, surface, createdBy) {
      const result = await pool.query<Row>(
        `${SELECT}
          WHERE organization_id = $1 AND link_id = $2 AND surface = $3
            AND created_by = $4 AND status = 'active'
          ORDER BY updated_at DESC LIMIT 1`,
        [organizationId, linkId, surface, createdBy],
      );
      const row = result.rows[0];
      return row === undefined ? null : mapRow(row);
    },

    async save(organizationId, linkId, sessionId, state) {
      const result = await pool.query<Row>(
        `UPDATE template_edit_sessions
            SET state = $4, updated_at = now()
          WHERE organization_id = $1 AND link_id = $2 AND id = $3 AND status = 'active'
          RETURNING id, organization_id, link_id, created_by, surface,
                    template_id, template_version, status, state, created_at, updated_at`,
        [organizationId, linkId, sessionId, JSON.stringify(state)],
      );
      const row = result.rows[0];
      return row === undefined ? null : mapRow(row);
    },

    async archive(organizationId, linkId, sessionId) {
      const result = await pool.query(
        `UPDATE template_edit_sessions
            SET status = 'archived', updated_at = now()
          WHERE organization_id = $1 AND link_id = $2 AND id = $3 AND status = 'active'`,
        [organizationId, linkId, sessionId],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
