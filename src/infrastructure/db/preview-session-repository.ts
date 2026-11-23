import type { Pool } from "pg";
import type {
  CreatePreviewSessionInput,
  PreviewSession,
  PreviewSessionRepository,
  PreviewSurface,
  UpdatePreviewSessionInput,
} from "@/application/ports/preview-session-repository";
import type { TemplateParamValues } from "@/domain/template-params";

type PreviewSessionRow = {
  id: string;
  token_hash: string;
  user_id: string;
  organization_id: string;
  link_id: string;
  surface: PreviewSurface;
  template_id: string | null;
  template_version: string | null;
  params: unknown;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, token_hash, user_id, organization_id, link_id, surface, template_id, template_version, params, expires_at, created_at, updated_at";

function toSession(row: PreviewSessionRow): PreviewSession {
  return {
    id: row.id,
    tokenHash: row.token_hash,
    userId: row.user_id,
    organizationId: row.organization_id,
    linkId: row.link_id,
    surface: row.surface,
    templateId: row.template_id,
    templateVersion: row.template_version,
    params: row.params as TemplateParamValues,
    expiresAt: row.expires_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export function pgPreviewSessionRepository(pool: Pool): PreviewSessionRepository {
  return {
    async create(input: CreatePreviewSessionInput): Promise<PreviewSession> {
      const { rows } = await pool.query<PreviewSessionRow>(
        `INSERT INTO preview_sessions
           (token_hash, user_id, organization_id, link_id, surface,
            template_id, template_version, params, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
         RETURNING ${COLUMNS}`,
        [
          input.tokenHash,
          input.userId,
          input.organizationId,
          input.linkId,
          input.surface,
          input.templateId,
          input.templateVersion,
          JSON.stringify(input.params),
          input.expiresAt,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la session d’aperçu");
      return toSession(row);
    },

    async updateByToken(
      tokenHash: string,
      input: UpdatePreviewSessionInput,
    ): Promise<PreviewSession | null> {
      const { rows } = await pool.query<PreviewSessionRow>(
        `UPDATE preview_sessions
            SET surface = $2,
                template_id = $3,
                template_version = $4,
                params = $5::jsonb,
                expires_at = $6,
                updated_at = now()
          WHERE token_hash = $1
            AND user_id = $7
            AND organization_id = $8
            AND link_id = $9
          RETURNING ${COLUMNS}`,
        [
          tokenHash,
          input.surface,
          input.templateId,
          input.templateVersion,
          JSON.stringify(input.params),
          input.expiresAt,
          input.userId,
          input.organizationId,
          input.linkId,
        ],
      );
      const row = rows[0];
      return row ? toSession(row) : null;
    },

    async findByTokenHash(tokenHash: string): Promise<PreviewSession | null> {
      const { rows } = await pool.query<PreviewSessionRow>(
        `SELECT ${COLUMNS} FROM preview_sessions
          WHERE token_hash = $1 AND expires_at > now()`,
        [tokenHash],
      );
      const row = rows[0];
      return row ? toSession(row) : null;
    },

    async deleteExpired(): Promise<number> {
      const result = await pool.query("DELETE FROM preview_sessions WHERE expires_at <= now()");
      return result.rowCount ?? 0;
    },
  };
}
