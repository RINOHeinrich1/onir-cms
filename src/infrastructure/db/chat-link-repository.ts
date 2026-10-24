import type { Pool } from "pg";
import type {
  ChatLinkRepository,
  CreateChatLinkInput,
} from "@/application/ports/chat-link-repository";
import {
  type ActiveLinkIdentificationMode,
  type ChatLink,
  type ChatLinkSources,
  type ChatLinkType,
  isChatLinkType,
  parseLinkSources,
  parseVisualTemplateConfig,
  parseVisualTemplateParams,
} from "@/domain/entities/chat";

type ChatLinkRow = {
  id: string;
  organization_id: string;
  label: string;
  type: string;
  identification_mode: ActiveLinkIdentificationMode;
  prospect_id: string | null;
  created_by: string | null;
  actif: boolean;
  expires_at: Date | null;
  template_key: string;
  template_version: number;
  sources: unknown;
  confidentialite_id: string | null;
  user_state_enabled: boolean;
  visual_template_id: string | null;
  visual_template_version: string | null;
  visual_template_config: unknown;
  visual_template_params: unknown;
  ai_provider_id: string | null;
  ai_model: string | null;
  visit_count: number;
  last_visit_at: Date | null;
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, label, type, identification_mode, prospect_id, created_by, actif, expires_at, template_key, template_version, sources, confidentialite_id, user_state_enabled, visual_template_id, visual_template_version, visual_template_config, visual_template_params, ai_provider_id, ai_model, visit_count, last_visit_at, created_at";

function toEntity(row: ChatLinkRow): ChatLink {
  if (!isChatLinkType(row.type)) {
    throw new Error(`Type de lien inconnu : ${row.type}`);
  }
  const type: ChatLinkType = row.type;
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    type,
    identificationMode: row.identification_mode,
    prospectId: row.prospect_id,
    createdBy: row.created_by,
    actif: row.actif,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    sources: parseLinkSources(row.sources),
    confidentialiteId: row.confidentialite_id,
    userStateEnabled: row.user_state_enabled,
    visualTemplateId: row.visual_template_id,
    visualTemplateVersion: row.visual_template_version,
    visualTemplateConfig: parseVisualTemplateConfig(row.visual_template_config),
    visualTemplateParams: parseVisualTemplateParams(row.visual_template_params),
    aiProviderId: row.ai_provider_id,
    aiModel: row.ai_model,
    visitCount: row.visit_count,
    lastVisitAt: row.last_visit_at ? row.last_visit_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `ChatLinkRepository` (B018, scopé ADR-0025). */
export function pgChatLinkRepository(pool: Pool): ChatLinkRepository {
  return {
    async findById(organizationId, id): Promise<ChatLink | null> {
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByTokenHash(tokenHash): Promise<ChatLink | null> {
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async list(organizationId): Promise<ChatLink[]> {
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links
          WHERE organization_id = $1
          ORDER BY created_at DESC`,
        [organizationId],
      );
      return rows.map((row) => toEntity(row));
    },

    async recordVisit(organizationId, id): Promise<void> {
      await pool.query(
        `UPDATE chat_links
            SET visit_count = visit_count + 1, last_visit_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
    },

    async create(organizationId, input: CreateChatLinkInput): Promise<ChatLink> {
      const { rows } = await pool.query<ChatLinkRow>(
        `INSERT INTO chat_links (organization_id, token_hash, token_enc, label, type, identification_mode, prospect_id, created_by, expires_at, template_key, template_version, sources, confidentialite_id, user_state_enabled, visual_template_id, visual_template_version, visual_template_config, visual_template_params, ai_provider_id, ai_model)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.tokenHash,
          input.tokenEnc,
          input.label,
          input.type,
          input.identificationMode,
          input.prospectId,
          input.createdBy,
          input.expiresAt,
          input.templateKey,
          input.templateVersion,
          JSON.stringify(input.sources),
          input.confidentialiteId,
          input.userStateEnabled,
          input.visualTemplateId,
          input.visualTemplateVersion,
          JSON.stringify(input.visualTemplateConfig),
          JSON.stringify(input.visualTemplateParams),
          input.aiProviderId ?? null,
          input.aiModel ?? null,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du lien");
      return toEntity(row);
    },

    async getTokenEnc(organizationId, id): Promise<string | null> {
      const { rows } = await pool.query<{ token_enc: string | null }>(
        "SELECT token_enc FROM chat_links WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      const row = rows[0];
      return row ? row.token_enc : null;
    },

    async setLinkToken(
      organizationId,
      id,
      input: { tokenHash: string; tokenEnc: string },
    ): Promise<ChatLink | null> {
      const { rows } = await pool.query<ChatLinkRow>(
        `UPDATE chat_links SET token_hash = $1, token_enc = $2
          WHERE organization_id = $3 AND id = $4
          RETURNING ${COLUMNS}`,
        [input.tokenHash, input.tokenEnc, organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async updateDetails(
      organizationId,
      id,
      patch: {
        label: string;
        identificationMode: ActiveLinkIdentificationMode;
        expiresAt: string | null;
        sources: ChatLinkSources;
        confidentialiteId: string | null;
        userStateEnabled: boolean;
        visualTemplateId: string | null;
        visualTemplateVersion: string | null;
        visualTemplateConfig: Record<string, string>;
        visualTemplateParams: Record<string, string | number | boolean>;
        aiProviderId?: string | null;
        aiModel?: string | null;
      },
    ): Promise<ChatLink | null> {
      const { rows } = await pool.query<ChatLinkRow>(
        `UPDATE chat_links SET label = $1, identification_mode = $2, expires_at = $3, sources = $4, confidentialite_id = $5, user_state_enabled = $6, visual_template_id = $7, visual_template_version = $8, visual_template_config = $9, visual_template_params = $10, ai_provider_id = $11, ai_model = $12
          WHERE organization_id = $13 AND id = $14
          RETURNING ${COLUMNS}`,
        [
          patch.label,
          patch.identificationMode,
          patch.expiresAt,
          JSON.stringify(patch.sources),
          patch.confidentialiteId,
          patch.userStateEnabled,
          patch.visualTemplateId,
          patch.visualTemplateVersion,
          JSON.stringify(patch.visualTemplateConfig),
          JSON.stringify(patch.visualTemplateParams),
          patch.aiProviderId ?? null,
          patch.aiModel ?? null,
          organizationId,
          id,
        ],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM chat_links WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
