import type { Pool } from "pg";
import { planLegacyChatbotMigration } from "./plan-legacy-chatbot-migration";

export type LegacyMigrationResult = {
  linkId: string;
  configId: string;
  version: number;
  contentScope: {
    connaissancesUpdated: number;
    mediasUpdated: number;
  };
};

type ExecuteOptions = {
  allowOpenConversations?: boolean;
};

async function tableExists(pool: Pool, name: string): Promise<boolean> {
  const { rows } = await pool.query<{ present: boolean }>(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [`public.${name}`],
  );
  return rows[0]?.present === true;
}

async function columnExists(pool: Pool, table: string, column: string): Promise<boolean> {
  const { rows } = await pool.query<{ present: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS present`,
    [table, column],
  );
  return rows[0]?.present === true;
}

/**
 * Exécute la migration d'un lien legacy vers une configuration chatbot.
 * Le lien, ses conversations et ses fiches ne sont jamais supprimés.
 * Rollback : remettre `chat_links.current_config_id` à NULL.
 */
export async function migrateLegacyChatbot(
  pool: Pool,
  linkId: string,
  options: ExecuteOptions = {},
): Promise<LegacyMigrationResult> {
  const plan = await planLegacyChatbotMigration(pool, linkId);
  const blocking = [...plan.blockers];
  if (plan.link.openConversations > 0 && options.allowOpenConversations !== true) {
    blocking.push(
      `${plan.link.openConversations} conversation(s) ouverte(s) : relancer avec --allow-open si la bascule en cours de conversation est acceptée`,
    );
  }
  if (plan.proposedConfig === null) blocking.push("Aucune configuration proposée");
  if (blocking.length > 0) {
    throw new Error(`Migration refusée : ${blocking.join(" ; ")}`);
  }

  if (!(await tableExists(pool, "chatbot_configs"))) {
    throw new Error("Table chatbot_configs absente : appliquer les migrations 0059+");
  }
  if (!(await columnExists(pool, "chat_links", "current_config_id"))) {
    throw new Error("Colonne chat_links.current_config_id absente");
  }
  if (!(await columnExists(pool, "base_connaissances", "chat_link_ids"))) {
    throw new Error("Colonne base_connaissances.chat_link_ids absente");
  }
  if (!(await columnExists(pool, "medias", "chat_link_ids"))) {
    throw new Error("Colonne medias.chat_link_ids absente");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = await client.query<{ current_config_id: string | null }>(
      `SELECT current_config_id FROM chat_links
        WHERE organization_id = $1 AND id = $2
        FOR UPDATE`,
      [plan.link.organizationId, linkId],
    );
    const current = locked.rows[0];
    if (current === undefined) throw new Error("Lien introuvable pendant la migration");
    if (current.current_config_id !== null) {
      throw new Error("Lien déjà configuré : migration annulée");
    }

    const next = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version), 0) + 1 AS version
         FROM chatbot_configs
        WHERE organization_id = $1 AND chat_link_id = $2`,
      [plan.link.organizationId, linkId],
    );
    const version = Number(next.rows[0]?.version ?? 1);
    const config = plan.proposedConfig;
    if (config === null) throw new Error("Configuration proposée absente");

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO chatbot_configs
         (organization_id, chat_link_id, version, system_prompt, simple_settings,
          fiche_definitions, data_selection, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
       RETURNING id`,
      [
        plan.link.organizationId,
        linkId,
        version,
        config.systemPrompt,
        JSON.stringify({ ...config.simple, behaviorMode: config.behaviorMode }),
        JSON.stringify(config.fiches),
        JSON.stringify(config.dataSelection),
      ],
    );
    const configId = inserted.rows[0]?.id;
    if (configId === undefined) throw new Error("Création de configuration impossible");

    const addIds = plan.contentScope.chatLinkIdsToAdd;
    let connaissancesUpdated = 0;
    let mediasUpdated = 0;
    if (plan.contentScope.scopedConnaissances > 0) {
      const updated = await client.query(
        `UPDATE base_connaissances
            SET chat_link_ids = ARRAY(
              SELECT DISTINCT unnest(chat_link_ids || $2::uuid[])
            ), updated_at = now()
          WHERE organization_id = $1
            AND actif
            AND template_keys @> ARRAY[$3]::text[]`,
        [plan.link.organizationId, addIds, plan.link.templateKey],
      );
      connaissancesUpdated = updated.rowCount ?? 0;
    }
    if (plan.contentScope.scopedMedias > 0) {
      const updated = await client.query(
        `UPDATE medias
            SET chat_link_ids = ARRAY(
              SELECT DISTINCT unnest(chat_link_ids || $2::uuid[])
            ), updated_at = now()
          WHERE organization_id = $1
            AND actif
            AND template_keys @> ARRAY[$3]::text[]`,
        [plan.link.organizationId, addIds, plan.link.templateKey],
      );
      mediasUpdated = updated.rowCount ?? 0;
    }

    await client.query(
      `UPDATE chat_links SET current_config_id = $1
        WHERE organization_id = $2 AND id = $3`,
      [configId, plan.link.organizationId, linkId],
    );
    await client.query("COMMIT");
    return {
      linkId,
      configId,
      version,
      contentScope: { connaissancesUpdated, mediasUpdated },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function formatLegacyMigrationResult(result: LegacyMigrationResult): string {
  return [
    "# Migration legacy exécutée",
    "",
    `- Lien : ${result.linkId}`,
    `- Configuration : ${result.configId} (v${result.version})`,
    `- Connaissances mises à jour : ${result.contentScope.connaissancesUpdated}`,
    `- Médias mis à jour : ${result.contentScope.mediasUpdated}`,
    "",
  ].join("\n");
}
