import type { Pool, PoolClient } from "pg";
import type {
  AiTokenUsageInput,
  ChatLinkRepository,
  CreateChatLinkInput,
} from "@/application/ports/chat-link-repository";
import {
  type ActiveLinkIdentificationMode,
  type ChatLink,
  type ChatLinkChannel,
  type ChatLinkChannels,
  type ChatLinkQuota,
  type ChatLinkSources,
  type ChatLinkSurface,
  type ChatLinkType,
  isChatLinkSurface,
  isChatLinkType,
  legacyChannelFields,
  parseLinkSources,
  parseTokenResetMode,
  parseVisualTemplateConfig,
  parseVisualTemplateParams,
  parseWidgetConfig,
  type TokenResetMode,
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
  current_config_id: string | null;
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
  max_fiches: number | null;
  max_tokens: string | null;
  token_reset_mode: string;
  token_reset_days: number | null;
  tokens_used: string;
  token_period_started_at: Date;
  fiches_generated: number;
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
  "id, organization_id, label, type, surface, identification_mode, prospect_id, created_by, actif, expires_at, template_key, template_version, current_config_id, sources, confidentialite_id, user_state_enabled, visual_template_id, visual_template_version, visual_template_config, visual_template_params, widget_config, ai_provider_id, ai_model, visit_count, last_visit_at, max_fiches, max_tokens, token_reset_mode, token_reset_days, tokens_used, token_period_started_at, fiches_generated, created_at";

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

function toQuota(row: ChatLinkRow): ChatLinkQuota {
  return {
    maxFiches: row.max_fiches,
    fichesGenerated: row.fiches_generated,
    maxTokens: row.max_tokens === null ? null : Number(row.max_tokens),
    tokensUsed: Number(row.tokens_used),
    tokenResetMode: parseTokenResetMode(row.token_reset_mode),
    tokenResetDays: row.token_reset_days,
    tokenPeriodStartedAt: row.token_period_started_at.toISOString(),
  };
}

/**
 * Remet à zéro une période tokens échue avant toute lecture ou écriture.
 * La condition est idempotente et ne touche pas les autres liens.
 */
async function resetExpiredTokenPeriod(
  pool: Pool,
  where: string,
  params: unknown[],
): Promise<void> {
  await pool.query(
    `UPDATE chat_links
        SET tokens_used = 0, token_period_started_at = now()
      WHERE token_reset_mode = 'duration'
        AND token_reset_days IS NOT NULL
        AND token_period_started_at + make_interval(days => token_reset_days) <= now()
        AND ${where}`,
    params,
  );
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
    currentConfigId: row.current_config_id,
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
    quotas: toQuota(row),
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
      await resetExpiredTokenPeriod(pool, "organization_id = $1 AND id = $2", [organizationId, id]);
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      if (!row) return null;
      return toEntity(row, (await loadChannels(pool, [row])).get(row.id) ?? fallbackChannels(row));
    },

    async findByTokenHash(tokenHash): Promise<ChatLink | null> {
      await resetExpiredTokenPeriod(pool, "token_hash = $1", [tokenHash]);
      const { rows } = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE token_hash = $1`,
        [tokenHash],
      );
      const row = rows[0];
      if (!row) return null;
      return toEntity(row, (await loadChannels(pool, [row])).get(row.id) ?? fallbackChannels(row));
    },

    async list(organizationId): Promise<ChatLink[]> {
      await resetExpiredTokenPeriod(pool, "organization_id = $1", [organizationId]);
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
          `INSERT INTO chat_links (organization_id, token_hash, token_enc, label, type, surface, identification_mode, prospect_id, created_by, expires_at, template_key, template_version, sources, confidentialite_id, user_state_enabled, visual_template_id, visual_template_version, visual_template_config, visual_template_params, widget_config, ai_provider_id, ai_model, max_fiches, max_tokens, token_reset_mode, token_reset_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
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
            input.maxFiches ?? null,
            input.maxTokens ?? null,
            input.tokenResetMode ?? "manual",
            input.tokenResetMode === "duration" ? (input.tokenResetDays ?? null) : null,
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
        maxFiches?: number | null;
        maxTokens?: number | null;
        tokenResetMode?: TokenResetMode;
        tokenResetDays?: number | null;
      },
    ): Promise<ChatLink | null> {
      const existing = await pool.query<ChatLinkRow>(
        `SELECT ${COLUMNS} FROM chat_links WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const existingRow = existing.rows[0];
      if (!existingRow) return null;
      const existingQuota = toQuota(existingRow);
      const maxFiches = patch.maxFiches === undefined ? existingQuota.maxFiches : patch.maxFiches;
      const maxTokens = patch.maxTokens === undefined ? existingQuota.maxTokens : patch.maxTokens;
      const tokenResetMode = patch.tokenResetMode ?? existingQuota.tokenResetMode;
      const tokenResetDays =
        tokenResetMode === "duration"
          ? patch.tokenResetDays === undefined
            ? existingQuota.tokenResetDays
            : patch.tokenResetDays
          : null;
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
          `UPDATE chat_links SET label = $1, surface = $2, identification_mode = $3, expires_at = $4, sources = $5, confidentialite_id = $6, user_state_enabled = $7, visual_template_id = $8, visual_template_version = $9, visual_template_config = $10, visual_template_params = $11, widget_config = $12, ai_provider_id = $13, ai_model = $14, max_fiches = $15, max_tokens = $16, token_reset_mode = $17, token_reset_days = $18
            WHERE organization_id = $19 AND id = $20
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
            maxFiches,
            maxTokens,
            tokenResetMode,
            tokenResetDays,
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

    async resetTokenUsage(organizationId, id): Promise<ChatLink | null> {
      const { rows } = await pool.query<ChatLinkRow>(
        `UPDATE chat_links
            SET tokens_used = 0, token_period_started_at = now()
          WHERE organization_id = $1 AND id = $2
          RETURNING ${COLUMNS}`,
        [organizationId, id],
      );
      const row = rows[0];
      if (!row) return null;
      return toEntity(row, (await loadChannels(pool, [row])).get(row.id) ?? fallbackChannels(row));
    },

    async reserveFiche(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        `UPDATE chat_links
            SET fiches_generated = fiches_generated + 1
          WHERE organization_id = $1 AND id = $2
            AND (max_fiches IS NULL OR fiches_generated < max_fiches)`,
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async reserveFiches(organizationId, id, count): Promise<boolean> {
      if (count <= 0) return true;
      const result = await pool.query(
        `UPDATE chat_links
            SET fiches_generated = fiches_generated + $3
          WHERE organization_id = $1 AND id = $2
            AND (max_fiches IS NULL OR fiches_generated + $3 <= max_fiches)`,
        [organizationId, id, count],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async releaseFiche(organizationId, id): Promise<void> {
      await pool.query(
        `UPDATE chat_links
            SET fiches_generated = GREATEST(fiches_generated - 1, 0)
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
    },

    async releaseFiches(organizationId, id, count): Promise<void> {
      if (count <= 0) return;
      await pool.query(
        `UPDATE chat_links
            SET fiches_generated = GREATEST(fiches_generated - $3, 0)
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, count],
      );
    },

    async recordAiUsage(organizationId, id, input: AiTokenUsageInput) {
      await resetExpiredTokenPeriod(pool, "organization_id = $1 AND id = $2", [organizationId, id]);
      const promptTokens = Math.max(0, Math.trunc(input.promptTokens));
      const completionTokens = Math.max(0, Math.trunc(input.completionTokens));
      const totalTokens = Math.max(0, Math.trunc(input.totalTokens));
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<ChatLinkRow>(
          `UPDATE chat_links
              SET tokens_used = tokens_used + $3
            WHERE organization_id = $1 AND id = $2
            RETURNING ${COLUMNS}`,
          [organizationId, id, totalTokens],
        );
        const row = rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `INSERT INTO chat_link_ai_usage
             (organization_id, link_id, conversation_id, operation,
              prompt_tokens, completion_tokens, total_tokens)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            organizationId,
            id,
            input.conversationId,
            input.operation,
            promptTokens,
            completionTokens,
            totalTokens,
          ],
        );
        await client.query("COMMIT");
        return toQuota(row);
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
