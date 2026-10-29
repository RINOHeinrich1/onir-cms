import type { Pool } from "pg";

type LegacyLinkRow = {
  id: string;
  organization_name: string;
  label: string;
  type: string;
  actif: boolean;
  expires_at: Date | null;
  template_key: string;
  template_version: number;
  template_exists: boolean;
  version_exists: boolean;
  conversations: string;
  open_conversations: string;
  fiches: string;
  connaissances_visibles: string;
  medias_visibles: string;
};

type AuditSummary = {
  total_links: string;
  legacy_links: string;
  configured_links: string;
  blocking_links: string;
  templates: string;
  template_versions: string;
};

type AuditResult = {
  generatedAt: string;
  migration: string;
  schema: {
    currentConfigId: boolean;
    chatLinkIds: boolean;
    chatbotConfigs: boolean;
    conversationSummaries: boolean;
  };
  summary: {
    totalLinks: number;
    legacyLinks: number;
    configuredLinks: number;
    blockingLinks: number;
    templates: number;
    templateVersions: number;
  };
  links: {
    id: string;
    organization: string;
    label: string;
    type: string;
    actif: boolean;
    expiresAt: string | null;
    templateKey: string;
    templateVersion: number;
    templateExists: boolean;
    versionExists: boolean;
    conversations: number;
    openConversations: number;
    fiches: number;
    connaissancesVisibles: number;
    mediasVisibles: number;
    blocking: boolean;
  }[];
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

async function latestMigration(pool: Pool): Promise<string> {
  if (!(await tableExists(pool, "schema_migrations"))) return "aucune table schema_migrations";
  const { rows } = await pool.query<{ name: string }>(
    "SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1",
  );
  return rows[0]?.name ?? "aucune migration appliquée";
}

export async function auditLegacyChatbots(pool: Pool): Promise<AuditResult> {
  const currentConfigId = await columnExists(pool, "chat_links", "current_config_id");
  const chatLinkIds =
    (await columnExists(pool, "base_connaissances", "chat_link_ids")) &&
    (await columnExists(pool, "medias", "chat_link_ids"));
  const currentExpr = currentConfigId ? "l.current_config_id" : "NULL::uuid";
  const legacyWhere = currentConfigId ? "WHERE l.current_config_id IS NULL" : "";

  const summaryResult = await pool.query<AuditSummary>(
    `WITH totals AS (
       SELECT
         count(*)::text AS total_links,
         count(*) FILTER (WHERE ${currentExpr} IS NULL)::text AS legacy_links,
         count(*) FILTER (WHERE ${currentExpr} IS NOT NULL)::text AS configured_links,
         count(*) FILTER (
           WHERE ${currentExpr} IS NULL
             AND (l.template_key = '' OR t.id IS NULL OR tv.id IS NULL)
         )::text AS blocking_links
       FROM chat_links l
       LEFT JOIN chat_templates t ON t.key = l.template_key
       LEFT JOIN chat_template_versions tv ON tv.template_id = t.id AND tv.version = l.template_version
     )
     SELECT totals.*,
            (SELECT count(*)::text FROM chat_templates) AS templates,
            (SELECT count(*)::text FROM chat_template_versions) AS template_versions
       FROM totals`,
  );

  const { rows } = await pool.query<LegacyLinkRow>(
    `WITH conversation_stats AS (
       SELECT link_id,
              count(*)::text AS conversations,
              count(*) FILTER (WHERE statut = 'en_cours')::text AS open_conversations
         FROM conversations
        GROUP BY link_id
     ),
     fiche_stats AS (
       SELECT c.link_id, count(f.id)::text AS fiches
         FROM conversations c
         JOIN fiches f ON f.conversation_id = c.id
        GROUP BY c.link_id
     )
     SELECT l.id,
            o.name AS organization_name,
            l.label,
            l.type,
            l.actif,
            l.expires_at,
            l.template_key,
            l.template_version,
            (t.id IS NOT NULL) AS template_exists,
            (tv.id IS NOT NULL) AS version_exists,
            COALESCE(cs.conversations, '0') AS conversations,
            COALESCE(cs.open_conversations, '0') AS open_conversations,
            COALESCE(fs.fiches, '0') AS fiches,
            (
              SELECT count(*)::text FROM base_connaissances bc
               WHERE bc.organization_id = l.organization_id
                 AND bc.actif
                 AND (cardinality(bc.template_keys) = 0 OR l.template_key = ANY (bc.template_keys))
            ) AS connaissances_visibles,
            (
              SELECT count(*)::text FROM medias m
               WHERE m.organization_id = l.organization_id
                 AND m.actif
                 AND (cardinality(m.template_keys) = 0 OR l.template_key = ANY (m.template_keys))
            ) AS medias_visibles
       FROM chat_links l
       JOIN organizations o ON o.id = l.organization_id
       LEFT JOIN chat_templates t ON t.key = l.template_key
       LEFT JOIN chat_template_versions tv ON tv.template_id = t.id AND tv.version = l.template_version
       LEFT JOIN conversation_stats cs ON cs.link_id = l.id
       LEFT JOIN fiche_stats fs ON fs.link_id = l.id
       ${legacyWhere}
      ORDER BY o.name, l.label, l.id`,
  );

  const summary = summaryResult.rows[0];
  const links = rows.map((row) => {
    const templateExists = row.template_exists;
    const versionExists = row.version_exists;
    const blocking = !templateExists || !versionExists || row.template_key === "";
    return {
      id: row.id,
      organization: row.organization_name,
      label: row.label,
      type: row.type,
      actif: row.actif,
      expiresAt: row.expires_at?.toISOString() ?? null,
      templateKey: row.template_key,
      templateVersion: row.template_version,
      templateExists,
      versionExists,
      conversations: Number(row.conversations),
      openConversations: Number(row.open_conversations),
      fiches: Number(row.fiches),
      connaissancesVisibles: Number(row.connaissances_visibles),
      mediasVisibles: Number(row.medias_visibles),
      blocking,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    migration: await latestMigration(pool),
    schema: {
      currentConfigId,
      chatLinkIds,
      chatbotConfigs: await tableExists(pool, "chatbot_configs"),
      conversationSummaries: await tableExists(pool, "conversation_summaries"),
    },
    summary: {
      totalLinks: Number(summary?.total_links ?? 0),
      legacyLinks: Number(summary?.legacy_links ?? 0),
      configuredLinks: Number(summary?.configured_links ?? 0),
      blockingLinks: links.filter((link) => link.blocking).length,
      templates: Number(summary?.templates ?? 0),
      templateVersions: Number(summary?.template_versions ?? 0),
    },
    links,
  };
}

function bool(value: boolean): string {
  return value ? "oui" : "non";
}

function escapeCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

export function formatLegacyChatbotAudit(result: AuditResult): string {
  const lines: string[] = [
    "# Audit des anciens chatbots",
    "",
    `- Généré le : ${result.generatedAt}`,
    `- Dernière migration : ${result.migration}`,
    `- Mode legacy actif : ${bool(result.schema.currentConfigId)}`,
    `- Portée nouveaux liens disponibles : ${bool(result.schema.chatLinkIds)}`,
    `- Table chatbot_configs : ${bool(result.schema.chatbotConfigs)}`,
    "",
    "## Synthèse",
    "",
    `- Liens total : ${result.summary.totalLinks}`,
    `- Liens legacy : ${result.summary.legacyLinks}`,
    `- Liens déjà configurés : ${result.summary.configuredLinks}`,
    `- Liens legacy bloquants : ${result.summary.blockingLinks}`,
    `- Modèles historiques : ${result.summary.templates}`,
    `- Versions historiques : ${result.summary.templateVersions}`,
    "",
  ];

  if (result.links.length === 0) {
    lines.push("Aucun lien legacy à migrer.", "");
    return lines.join("\n");
  }

  lines.push(
    "## Liens legacy",
    "",
    "| Organisation | Lien | Type | Actif | Template | Version | Template OK | Version OK | Conversations | Ouvertes | Fiches | Connaissances visibles | Médias visibles | Bloquant |",
    "|---|---|---|---|---|---:|---|---|---:|---:|---:|---:|---:|---|",
  );
  for (const link of result.links) {
    lines.push(
      `| ${escapeCell(link.organization)} | ${escapeCell(link.label || link.id)} | ${link.type} | ${bool(link.actif)} | ${escapeCell(link.templateKey)} | ${link.templateVersion} | ${bool(link.templateExists)} | ${bool(link.versionExists)} | ${link.conversations} | ${link.openConversations} | ${link.fiches} | ${link.connaissancesVisibles} | ${link.mediasVisibles} | ${bool(link.blocking)} |`,
    );
  }
  lines.push("");

  const blocking = result.links.filter((link) => link.blocking);
  if (blocking.length > 0) {
    lines.push("## Liens bloquants", "");
    for (const link of blocking) {
      lines.push(
        `- ${link.organization} — ${link.label || link.id} : template « ${link.templateKey} » v${link.templateVersion} introuvable.`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}
