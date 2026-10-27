import type { Pool, PoolClient } from "pg";
import type {
  ChatLinkRepository,
  CreateChatLinkInput,
} from "@/application/ports/chat-link-repository";
import {
  type ActiveLinkIdentificationMode,
  type ChatLink,
  type ChatLinkChannel,
  type ChatLinkChannels,
  type ChatLinkSources,
  type ChatLinkSurface,
  type ChatLinkType,
  isChatLinkSurface,
  isChatLinkType,
  legacyChannelFields,
  parseLinkSources,
  parseVisualTemplateConfig,
  parseVisualTemplateParams,
  parseWidgetConfig,
} from "@/domain/entities/chat";

type ChatLinkRow = {
  id: string;
  organization_id: string;
  label: string;
  type: string;
  surface: string;
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
  widget_config: unknown;
  ai_provider_id: string | null;
  ai_model: string | null;
  visit_count: number;
  last_visit_at: Date | null;
  created_at: Date;
};

type ChannelRow = {
  link_id: string;
  channel: string;
  enabled: boolean;
  identification_mode: ActiveLinkIdentificationMode;
  confidentialite_id: string | null;
  visual_template_id: string | null;
  visual_template_version: string | null;
  visual_template_config: unknown;
  visual_template_params: unknown;
  channel_config: unknown;
};

const COLUMNS =
  "id, organization_id, label, type, surface, identification_mode, prospect_id, created_by, actif, expires_at, template_key, template_version, sources, confidentialite_id, user_state_enabled, visual_template_id, visual_template_version, visual_template_config, visual_template_params, widget_config, ai_provider_id, ai_model, visit_count, last_visit_at, created_at";

const CHANNEL_COLUMNS =
  "link_id, channel, enabled, identification_mode, confidentialite_id, visual_template_id, visual_template_version, visual_template_config, visual_template_params, channel_config";

function fallbackChannels(row: ChatLinkRow): ChatLinkChannels {
  const base = {
    identificationMode: row.identification_mode,
    confidentialiteId: row.confidentialite_id,
    visualTemplateId: row.visual_template_id,
    visualTemplateVersion: row.visual_template_version,
    visualTemplateConfig: parseVisualTemplateConfig(row.visual_template_config),
    visualTemplateParams: parseVisualTemplateParams(row.visual_template_params),
  };
  return {
    page: {
      channel: "page",
      enabled: row.surface === "page",
      ...base,
      widgetConfig: {},
    },
    widget: {
      channel: "widget",
      enabled: row.surface === "widget",
      ...base,
      identificationMode: row.type === "standard" ? "anonymous" : row.identification_mode,
      confidentialiteId: null,
      widgetConfig: parseWidgetConfig(row.widget_config),
    },
  };
}

function toChannel(row: ChannelRow): ChatLinkChannel {
  if (!isChatLinkSurface(row.channel)) {
    throw new Error(`Canal de lien inconnu : ${row.channel}`);
  }
  return {
    channel: row.channel,
    enabled: row.enabled,
    identificationMode: row.identification_mode,
    confidentialiteId: row.confidentialite_id,
    visualTemplateId: row.visual_template_id,
    visualTemplateVersion: row.visual_template_version,
    visualTemplateConfig: parseVisualTemplateConfig(row.visual_template_config),
    visualTemplateParams: parseVisualTemplateParams(row.visual_template_params),
    widgetConfig: row.channel === "widget" ? parseWidgetConfig(row.channel_config) : {},
  };
}

function toEntity(row: ChatLinkRow, channels: ChatLinkChannels): ChatLink {
  if (!isChatLinkType(row.type)) {
    throw new Error(`Type de lien inconnu : ${row.type}`);
  }
  const type: ChatLinkType = row.type;
  const summary = legacyChannelFields(channels);
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    type,
    surface: summary.surface,
    identificationMode: summary.identificationMode,
    prospectId: row.prospect_id,
    createdBy: row.created_by,
    actif: row.actif,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    sources: parseLinkSources(row.sources),
    confidentialiteId: summary.confidentialiteId,
    userStateEnabled: row.user_state_enabled,
    visualTemplateId: summary.visualTemplateId,
    visualTemplateVersion: summary.visualTemplateVersion,
    visualTemplateConfig: summary.visualTemplateConfig,
    visualTemplateParams: summary.visualTemplateParams,
    widgetConfig: summary.widgetConfig,
    channels,
    aiProviderId: row.ai_provider_id,
    aiModel: row.ai_model,
    visitCount: row.visit_count,
    lastVisitAt: row.last_visit_at ? row.last_visit_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

/** Construit les deux canaux lorsque l'entrée ne les fournit pas. */
function channelsFromInput(input: {
  surface: ChatLinkSurface;
  type: ChatLinkType;
  identificationMode: ActiveLinkIdentificationMode;
  confidentialiteId: string | null;
  visualTemplateId: string | null;
  visualTemplateVersion: string | null;
  visualTemplateConfig: Record<string, string>;
  visualTemplateParams: Record<string, string | number | boolean>;
  widgetConfig: Record<string, unknown>;
}): ChatLinkChannels {
  const base = {
    identificationMode: input.identificationMode,
    confidentialiteId: input.confidentialiteId,
    visualTemplateId: input.visualTemplateId,
    visualTemplateVersion: input.visualTemplateVersion,
    visualTemplateConfig: input.visualTemplateConfig,
    visualTemplateParams: input.visualTemplateParams,
  };
  return {
    page: {
      channel: "page",
      enabled: input.surface === "page",
      ...base,
      widgetConfig: {},
    },
    widget: {
      channel: "widget",
      enabled: input.surface === "widget",
      ...base,
      identificationMode: input.type === "standard" ? "anonymous" : input.identificationMode,
      confidentialiteId: null,
      widgetConfig: input.widgetConfig,
    },
  };
}

async function loadChannels(
  pool: Pool,
  rows: ChatLinkRow[],
): Promise<Map<string, ChatLinkChannels>> {
  const result = new Map<string, ChatLinkChannels>();
  for (const row of rows) result.set(row.id, fallbackChannels(row));
  if (rows.length === 0) return result;
  const { rows: channelRows } = await pool.query<ChannelRow>(
    `SELECT ${CHANNEL_COLUMNS}
       FROM chat_link_channels
      WHERE link_id = ANY($1::uuid[])`,
    [rows.map((row) => row.id)],
  );
  for (const channelRow of channelRows) {
    const current = result.get(channelRow.link_id);
    if (current === undefined) continue;
    const channel = toChannel(channelRow);
    result.set(channelRow.link_id, { ...current, [channel.channel]: channel });
  }
  return result;
}

async function upsertChannels(
  client: PoolClient,
  linkId: string,
  channels: ChatLinkChannels,
): Promise<void> {
  for (const channel of [channels.page, channels.widget]) {
    await client.query(
      `INSERT INTO chat_link_channels
         (link_id, channel, enabled, identification_mode, confidentialite_id,
          visual_template_id, visual_template_version, visual_template_config,
          visual_template_params, channel_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (link_id, channel) DO UPDATE SET
         enabled = EXCLUDED.enabled,
         identification_mode = EXCLUDED.identification_mode,
         confidentialite_id = EXCLUDED.confidentialite_id,
         visual_template_id = EXCLUDED.visual_template_id,
         visual_template_version = EXCLUDED.visual_template_version,
         visual_template_config = EXCLUDED.visual_template_config,
         visual_template_params = EXCLUDED.visual_template_params,
         channel_config = EXCLUDED.channel_config,
         updated_at = now()`,
      [
        linkId,
        channel.channel,
        channel.enabled,
        channel.identificationMode,
        channel.confidentialiteId,
        channel.visualTemplateId,
        channel.visualTemplateVersion,
        JSON.stringify(channel.visualTemplateConfig),
        JSON.stringify(channel.visualTemplateParams),
        JSON.stringify(channel.channel === "widget" ? channel.widgetConfig : {}),
      ],
    );
  }
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
      if (!row) return null;
      return toEntity(row, (await loadChannels(pool, [row])).get(row.id) ?? fallbackChannels(row));
    },

    async findByTokenHash(tokenHash): Promise<ChatLink | null> {
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) return null;
      return toEntity(row, (await loadChannels(pool, [row])).get(row.id) ?? fallbackChannels(row));
    },

    async list(organizationId): Promise<ChatLink[]> {
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links
          WHERE organization_id = $1
          ORDER BY created_at DESC`,
        [organizationId],
      );
      const channels = await loadChannels(pool, rows);
      return rows.map((row) => toEntity(row, channels.get(row.id) ?? fallbackChannels(row)));
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
      const channels = input.channels ?? channelsFromInput(input);
      const summary = legacyChannelFields(channels);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<ChatLinkRow>(
          `INSERT INTO chat_links (organization_id, token_hash, token_enc, label, type, surface, identification_mode, prospect_id, created_by, expires_at, template_key, template_version, sources, confidentialite_id, user_state_enabled, visual_template_id, visual_template_version, visual_template_config, visual_template_params, widget_config, ai_provider_id, ai_model)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
           RETURNING ${COLUMNS}`,
          [
            organizationId,
            input.tokenHash,
            input.tokenEnc,
            input.label,
            input.type,
            summary.surface,
            summary.identificationMode,
            input.prospectId,
            input.createdBy,
            input.expiresAt,
            input.templateKey,
            input.templateVersion,
            JSON.stringify(input.sources),
            summary.confidentialiteId,
            input.userStateEnabled,
            summary.visualTemplateId,
            summary.visualTemplateVersion,
            JSON.stringify(summary.visualTemplateConfig),
            JSON.stringify(summary.visualTemplateParams),
            JSON.stringify(summary.widgetConfig),
            input.aiProviderId ?? null,
            input.aiModel ?? null,
          ],
        );
        const row = rows[0];
        if (!row) throw new Error("Échec de création du lien");
        await upsertChannels(client, row.id, channels);
        await client.query("COMMIT");
        return toEntity(row, channels);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
      if (!row) return null;
      return toEntity(row, (await loadChannels(pool, [row])).get(row.id) ?? fallbackChannels(row));
    },

    async updateDetails(
      organizationId,
      id,
      patch: {
        label: string;
        surface?: ChatLinkSurface;
        identificationMode?: ActiveLinkIdentificationMode;
        expiresAt: string | null;
        sources: ChatLinkSources;
        confidentialiteId?: string | null;
        userStateEnabled: boolean;
        visualTemplateId?: string | null;
        visualTemplateVersion?: string | null;
        visualTemplateConfig?: Record<string, string>;
        visualTemplateParams?: Record<string, string | number | boolean>;
        widgetConfig?: Record<string, unknown>;
        channels?: ChatLinkChannels;
        aiProviderId?: string | null;
        aiModel?: string | null;
      },
    ): Promise<ChatLink | null> {
      const existing = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const existingRow = existing.rows[0];
      if (!existingRow) return null;
      const channels =
        patch.channels ??
        (() => {
          const current = fallbackChannels(existingRow);
          return current;
        })();
      const summary = legacyChannelFields(channels);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<ChatLinkRow>(
          `UPDATE chat_links SET label = $1, surface = $2, identification_mode = $3, expires_at = $4, sources = $5, confidentialite_id = $6, user_state_enabled = $7, visual_template_id = $8, visual_template_version = $9, visual_template_config = $10, visual_template_params = $11, widget_config = $12, ai_provider_id = $13, ai_model = $14
            WHERE organization_id = $15 AND id = $16
            RETURNING ${COLUMNS}`,
          [
            patch.label,
            summary.surface,
            summary.identificationMode,
            patch.expiresAt,
            JSON.stringify(patch.sources),
            summary.confidentialiteId,
            patch.userStateEnabled,
            summary.visualTemplateId,
            summary.visualTemplateVersion,
            JSON.stringify(summary.visualTemplateConfig),
            JSON.stringify(summary.visualTemplateParams),
            JSON.stringify(summary.widgetConfig),
            patch.aiProviderId ?? null,
            patch.aiModel ?? null,
            organizationId,
            id,
          ],
        );
        const row = rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        await upsertChannels(client, row.id, channels);
        await client.query("COMMIT");
        return toEntity(row, channels);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
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
