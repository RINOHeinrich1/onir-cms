import type { Pool } from "pg";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import {
  type ChatbotBehaviorMode,
  type ChatbotConfig,
  DEFAULT_CHATBOT_BEHAVIOR_MODE,
  type FicheDefinition,
  isChatbotBehaviorMode,
  parseChatbotDataSelection,
} from "@/domain/entities/chatbot-config";
import type { TemplateSimpleSettings } from "@/domain/template-settings";
import { normalizeTemplateSimpleSettings } from "@/domain/template-settings";

type Row = {
  id: string;
  organization_id: string;
  chat_link_id: string;
  version: number;
  system_prompt: string;
  simple_settings: unknown;
  fiche_definitions: unknown;
  data_selection: unknown;
  created_by: string | null;
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, chat_link_id, version, system_prompt, simple_settings, fiche_definitions, data_selection, created_by, created_at";

function behaviorModeFromSettings(value: unknown): ChatbotBehaviorMode {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const mode = (value as Record<string, unknown>).behaviorMode;
    if (isChatbotBehaviorMode(mode)) return mode;
  }
  return DEFAULT_CHATBOT_BEHAVIOR_MODE;
}

function toConfig(row: Row): ChatbotConfig {
  const simple = normalizeTemplateSimpleSettings(row.simple_settings);
  if (simple === null) {
    throw new Error(`Configuration ${row.id} invalide : réglages simples illisibles`);
  }
  if (!Array.isArray(row.fiche_definitions)) {
    throw new Error(`Configuration ${row.id} invalide : fiches de collecte illisibles`);
  }
  const dataSelection = parseChatbotDataSelection(row.data_selection);
  if (!dataSelection.ok) {
    throw new Error(`Configuration ${row.id} invalide : sélection de données illisible`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    chatLinkId: row.chat_link_id,
    version: row.version,
    behaviorMode: behaviorModeFromSettings(row.simple_settings),
    systemPrompt: row.system_prompt,
    simple: simple satisfies TemplateSimpleSettings,
    fiches: row.fiche_definitions as FicheDefinition[],
    dataSelection: dataSelection.value,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
  };
}

export function pgChatbotConfigRepository(pool: Pool): ChatbotConfigRepository {
  return {
    async currentForLink(organizationId, chatLinkId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM chatbot_configs
          WHERE organization_id = $1 AND chat_link_id = $2
          ORDER BY version DESC LIMIT 1`,
        [organizationId, chatLinkId],
      );
      return rows[0] ? toConfig(rows[0]) : null;
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM chatbot_configs
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toConfig(rows[0]) : null;
    },

    async listVersions(organizationId, chatLinkId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM chatbot_configs
          WHERE organization_id = $1 AND chat_link_id = $2
          ORDER BY version DESC`,
        [organizationId, chatLinkId],
      );
      return rows.map(toConfig);
    },

    async createVersion(organizationId, chatLinkId, input, createdBy) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const link = await client.query(
          "SELECT id FROM chat_links WHERE organization_id = $1 AND id = $2 FOR UPDATE",
          [organizationId, chatLinkId],
        );
        if (!link.rows[0]) throw new Error("Chatbot introuvable");
        const current = await client.query<{ max: number }>(
          `SELECT COALESCE(MAX(version), 0) AS max FROM chatbot_configs
            WHERE organization_id = $1 AND chat_link_id = $2`,
          [organizationId, chatLinkId],
        );
        const version = Number(current.rows[0]?.max ?? 0) + 1;
        const inserted = await client.query<Row>(
          `INSERT INTO chatbot_configs
             (organization_id, chat_link_id, version, system_prompt, simple_settings,
              fiche_definitions, data_selection, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${COLUMNS}`,
          [
            organizationId,
            chatLinkId,
            version,
            input.systemPrompt,
            JSON.stringify({ ...input.simple, behaviorMode: input.behaviorMode }),
            JSON.stringify(input.fiches),
            JSON.stringify(input.dataSelection),
            createdBy,
          ],
        );
        const row = inserted.rows[0];
        if (!row) throw new Error("Échec de création de la configuration");
        await client.query(
          "UPDATE chat_links SET current_config_id = $1 WHERE organization_id = $2 AND id = $3",
          [row.id, organizationId, chatLinkId],
        );
        await client.query("COMMIT");
        return toConfig(row);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
