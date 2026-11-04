import type { Pool, PoolClient } from "pg";
import type {
  ChatbotProvisioningRepository,
  ProvisionChatbotInput,
  ProvisionChatbotResult,
} from "@/application/ports/chatbot-provisioning-repository";
import { type ChatLinkChannels, legacyChannelFields } from "@/domain/entities/chat";
import { defaultChatbotFallback } from "@/domain/entities/chatbot-config";
import { defaultSearchToolConfig } from "@/domain/fiche-search-tool-config";
import { rethrowOrganizationChatbotLimit } from "./chatbot-limit";

type LinkRow = { id: string };
type ConfigRow = { id: string };

async function insertChannels(
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
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
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

async function insertLink(
  client: PoolClient,
  input: ProvisionChatbotInput,
  channels: ChatLinkChannels,
): Promise<string> {
  const summary = legacyChannelFields(channels);
  const { rows } = await client.query<LinkRow>(
    `INSERT INTO chat_links
       (organization_id, token_hash, token_enc, label, type, surface,
        identification_mode, prospect_id, created_by, expires_at, sources,
        confidentialite_id, user_state_enabled, visual_template_id,
        visual_template_version, visual_template_config, visual_template_params,
        widget_config, ai_provider_id, ai_model, max_fiches, max_tokens,
        token_reset_mode, token_reset_days)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
             $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
     RETURNING id`,
    [
      input.organizationId,
      input.link.tokenHash,
      input.link.tokenEnc,
      input.link.label,
      input.link.type,
      summary.surface,
      summary.identificationMode,
      input.link.prospectId,
      input.link.createdBy,
      input.link.expiresAt,
      JSON.stringify(input.link.sources),
      summary.confidentialiteId,
      input.link.userStateEnabled,
      summary.visualTemplateId,
      summary.visualTemplateVersion,
      JSON.stringify(summary.visualTemplateConfig),
      JSON.stringify(summary.visualTemplateParams),
      JSON.stringify(summary.widgetConfig),
      input.link.aiProviderId ?? null,
      input.link.aiModel ?? null,
      input.link.maxFiches ?? null,
      input.link.maxTokens ?? null,
      input.link.tokenResetMode ?? "manual",
      input.link.tokenResetMode === "duration" ? (input.link.tokenResetDays ?? null) : null,
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("Échec de création du lien");
  return row.id;
}

async function insertConfig(
  client: PoolClient,
  organizationId: string,
  linkId: string,
  input: ProvisionChatbotInput,
  knowledgeIds: string[],
): Promise<void> {
  const { rows } = await client.query<ConfigRow>(
    `INSERT INTO chatbot_configs
       (organization_id, chat_link_id, version, system_prompt, simple_settings,
        fiche_definitions, data_selection, fallback, search_tool, created_by)
     VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
    [
      organizationId,
      linkId,
      input.config.systemPrompt,
      JSON.stringify({ ...input.config.simple, behaviorMode: input.config.behaviorMode }),
      JSON.stringify(input.config.fiches),
      JSON.stringify(
        knowledgeIds.length > 0 || input.knowledge.length > 0
          ? {
              mode: "selected" as const,
              connaissanceIds: [
                ...input.config.dataSelection.connaissanceIds.filter(
                  (id) => !id.startsWith("staged-") && !id.startsWith("pending-"),
                ),
                ...knowledgeIds,
              ].filter((id, index, all) => all.indexOf(id) === index),
              mediaIds: [],
            }
          : input.config.dataSelection,
      ),
      JSON.stringify(input.config.fallback ?? defaultChatbotFallback()),
      JSON.stringify(input.config.searchTool ?? defaultSearchToolConfig()),
      input.createdBy,
    ],
  );
  const row = rows[0];
  if (row === undefined) throw new Error("Échec de création de la configuration");
  await client.query(
    "UPDATE chat_links SET current_config_id = $1 WHERE organization_id = $2 AND id = $3",
    [row.id, organizationId, linkId],
  );
}

async function insertKnowledge(
  client: PoolClient,
  organizationId: string,
  linkId: string,
  input: ProvisionChatbotInput,
): Promise<ProvisionChatbotResult["knowledge"] & { ids: string[] }> {
  const titles = input.knowledge.map((item) => item.titre);
  const existing = await client.query<{ titre: string }>(
    `SELECT lower(titre) AS titre
       FROM base_connaissances
      WHERE organization_id = $1 AND lower(titre) = ANY($2::text[])`,
    [organizationId, titles.map((title) => title.toLocaleLowerCase("fr"))],
  );
  const skipped = new Set(existing.rows.map((row) => row.titre));
  let created = 0;
  const ids: string[] = [];
  for (const item of input.knowledge) {
    const normalizedTitle = item.titre.toLocaleLowerCase("fr");
    if (skipped.has(normalizedTitle)) {
      skipped.add(normalizedTitle);
      continue;
    }
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO base_connaissances
         (organization_id, titre, contenu, chat_link_ids, created_by, origin)
       VALUES ($1, $2, $3, ARRAY[$4]::uuid[], $5, 'ai')
       RETURNING id`,
      [organizationId, item.titre, item.contenu, linkId, input.createdBy],
    );
    const insertedId = inserted.rows[0]?.id;
    if (insertedId !== undefined) ids.push(insertedId);
    skipped.add(normalizedTitle);
    created += 1;
  }
  const conflicted = input.knowledge
    .filter((item) => existing.rows.some((row) => row.titre === item.titre.toLocaleLowerCase("fr")))
    .map((item) => item.titre);
  return { created, skipped: [...new Set(conflicted)], ids };
}

export function pgChatbotProvisioningRepository(pool: Pool): ChatbotProvisioningRepository {
  return {
    async create(input: ProvisionChatbotInput): Promise<ProvisionChatbotResult> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const channels = input.link.channels;
        if (channels === undefined) throw new Error("Canaux du lien manquants");
        const linkId = await insertLink(client, input, channels);
        await insertChannels(client, linkId, channels);
        const knowledge = await insertKnowledge(client, input.organizationId, linkId, input);
        await insertConfig(client, input.organizationId, linkId, input, knowledge.ids);
        await client.query("COMMIT");
        return { linkId, knowledge };
      } catch (error) {
        await client.query("ROLLBACK");
        rethrowOrganizationChatbotLimit(error);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
