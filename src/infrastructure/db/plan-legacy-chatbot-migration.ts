import type { Pool } from "pg";
import {
  type ChatbotConfigInput,
  type FicheDefinition,
  parseChatbotConfig,
} from "@/domain/entities/chatbot-config";

type LinkRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  label: string;
  type: string;
  actif: boolean;
  template_key: string;
  template_version: number;
  current_config_id: string | null;
  open_conversations: string;
  conversations: string;
  fiches: string;
};

type VersionRow = {
  definition: unknown;
};

export type LegacyMigrationPlan = {
  generatedAt: string;
  link: {
    id: string;
    organizationId: string;
    organization: string;
    label: string;
    type: string;
    actif: boolean;
    templateKey: string;
    templateVersion: number;
    alreadyConfigured: boolean;
    openConversations: number;
    conversations: number;
    fiches: number;
  };
  template: {
    label: string;
    description: string;
    fieldCount: number;
    linksUsingTemplate: number;
    shareLinkIds: string[];
  } | null;
  proposedConfig: ChatbotConfigInput | null;
  contentScope: {
    scopedConnaissances: number;
    scopedMedias: number;
    globalConnaissances: number;
    globalMedias: number;
    chatLinkIdsToAdd: string[];
  };
  blockers: string[];
  warnings: string[];
};

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

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function buildCandidateConfig(
  definition: Record<string, unknown>,
  link: LinkRow,
): { config: ChatbotConfigInput | null; blockers: string[] } {
  const blockers: string[] = [];
  const key = typeof definition.key === "string" ? definition.key.trim() : link.template_key;
  const label = typeof definition.label === "string" ? definition.label.trim() : key;
  const systemPrompt =
    typeof definition.systemPrompt === "string" ? definition.systemPrompt.trim() : "";
  const renderTemplate =
    typeof definition.renderTemplate === "string" ? definition.renderTemplate : "";
  if (systemPrompt === "") blockers.push("Prompt système historique absent");
  if (!Array.isArray(definition.fields)) blockers.push("Champs historiques absents");
  if (renderTemplate.trim() === "") blockers.push("Template de rendu historique absent");

  const fiche: FicheDefinition = {
    key,
    label,
    description: typeof definition.description === "string" ? definition.description : "",
    intent: "",
    fields: Array.isArray(definition.fields) ? definition.fields : [],
    renderTemplate,
    instructions: "",
  };
  const candidate: ChatbotConfigInput = {
    behaviorMode: "expert",
    systemPrompt,
    simple: {
      role: "",
      objective: "",
      language: { mode: "auto" },
      tone: "",
      guardrails: [],
      extraInstructions: "",
    },
    fiches: [fiche],
    dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
  };
  const parsed = parseChatbotConfig(candidate);
  if (!parsed.ok) blockers.push(...parsed.errors);
  return { config: parsed.ok ? parsed.value : null, blockers };
}

export async function planLegacyChatbotMigration(
  pool: Pool,
  linkId: string,
): Promise<LegacyMigrationPlan> {
  const hasCurrentConfig = await columnExists(pool, "chat_links", "current_config_id");
  const currentExpr = hasCurrentConfig ? "l.current_config_id" : "NULL::uuid";
  const { rows } = await pool.query<LinkRow>(
    `SELECT l.id, l.organization_id, o.name AS organization_name, l.label, l.type, l.actif,
            l.template_key, l.template_version, ${currentExpr} AS current_config_id,
            (SELECT count(*)::text FROM conversations c WHERE c.link_id = l.id) AS conversations,
            (SELECT count(*)::text FROM conversations c WHERE c.link_id = l.id AND c.statut = 'en_cours') AS open_conversations,
            (SELECT count(f.id)::text FROM conversations c JOIN fiches f ON f.conversation_id = c.id WHERE c.link_id = l.id) AS fiches
       FROM chat_links l
       JOIN organizations o ON o.id = l.organization_id
      WHERE l.id = $1`,
    [linkId],
  );
  const link = rows[0];
  if (link === undefined) throw new Error("Lien introuvable");

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (link.current_config_id !== null)
    blockers.push("Lien déjà configuré (current_config_id non nul)");
  if (link.template_key.trim() === "") blockers.push("Clé de template historique absente");
  if (link.label.trim() === "") warnings.push("Libellé du lien vide");

  const versionResult = await pool.query<VersionRow>(
    `SELECT v.definition
       FROM chat_template_versions v
       JOIN chat_templates t ON t.id = v.template_id
      WHERE t.organization_id = $1 AND t.key = $2 AND v.version = $3
      LIMIT 1`,
    [link.organization_id, link.template_key, link.template_version],
  );
  const definition = asRecord(versionResult.rows[0]?.definition);
  if (definition === null) {
    blockers.push(`Template introuvable : ${link.template_key} v${link.template_version}`);
  }

  const candidate =
    definition === null ? { config: null, blockers: [] } : buildCandidateConfig(definition, link);
  blockers.push(...candidate.blockers);

  const contentScope = await pool.query<{
    scoped_connaissances: string;
    scoped_medias: string;
    global_connaissances: string;
    global_medias: string;
  }>(
    `SELECT
       (SELECT count(*)::text FROM base_connaissances
         WHERE organization_id = $1 AND actif AND $2 = ANY (template_keys)) AS scoped_connaissances,
       (SELECT count(*)::text FROM medias
         WHERE organization_id = $1 AND actif AND $2 = ANY (template_keys)) AS scoped_medias,
       (SELECT count(*)::text FROM base_connaissances
         WHERE organization_id = $1 AND actif AND cardinality(template_keys) = 0) AS global_connaissances,
       (SELECT count(*)::text FROM medias
         WHERE organization_id = $1 AND actif AND cardinality(template_keys) = 0) AS global_medias`,
    [link.organization_id, link.template_key],
  );

  const shareResult = await pool.query<{ id: string }>(
    `SELECT id FROM chat_links
      WHERE organization_id = $1 AND template_key = $2
      ORDER BY created_at, id`,
    [link.organization_id, link.template_key],
  );

  return {
    generatedAt: new Date().toISOString(),
    link: {
      id: link.id,
      organizationId: link.organization_id,
      organization: link.organization_name,
      label: link.label,
      type: link.type,
      actif: link.actif,
      templateKey: link.template_key,
      templateVersion: link.template_version,
      alreadyConfigured: link.current_config_id !== null,
      openConversations: Number(link.open_conversations),
      conversations: Number(link.conversations),
      fiches: Number(link.fiches),
    },
    template:
      definition === null
        ? null
        : {
            label: typeof definition.label === "string" ? definition.label : "",
            description: typeof definition.description === "string" ? definition.description : "",
            fieldCount: Array.isArray(definition.fields) ? definition.fields.length : 0,
            linksUsingTemplate: shareResult.rows.length,
            shareLinkIds: shareResult.rows.map((row) => row.id),
          },
    proposedConfig: candidate.config,
    contentScope: {
      scopedConnaissances: Number(contentScope.rows[0]?.scoped_connaissances ?? 0),
      scopedMedias: Number(contentScope.rows[0]?.scoped_medias ?? 0),
      globalConnaissances: Number(contentScope.rows[0]?.global_connaissances ?? 0),
      globalMedias: Number(contentScope.rows[0]?.global_medias ?? 0),
      chatLinkIdsToAdd: shareResult.rows.map((row) => row.id),
    },
    blockers,
    warnings,
  };
}

export function formatLegacyMigrationPlan(plan: LegacyMigrationPlan): string {
  const lines = [
    "# Plan de migration d'un chatbot legacy",
    "",
    `- Généré le : ${plan.generatedAt}`,
    `- Lien : ${plan.link.label || plan.link.id}`,
    `- Identifiant : ${plan.link.id}`,
    `- Organisation : ${plan.link.organization}`,
    `- Template : ${plan.link.templateKey} v${plan.link.templateVersion}`,
    `- Déjà configuré : ${plan.link.alreadyConfigured ? "oui" : "non"}`,
    `- Conversations : ${plan.link.conversations} (${plan.link.openConversations} ouverte(s))`,
    `- Fiches existantes : ${plan.link.fiches}`,
    "",
    "## Contenus visibles",
    "",
    `- Connaissances scopées à l'ancien template : ${plan.contentScope.scopedConnaissances}`,
    `- Médias scopés à l'ancien template : ${plan.contentScope.scopedMedias}`,
    `- Connaissances globales : ${plan.contentScope.globalConnaissances}`,
    `- Médias globaux : ${plan.contentScope.globalMedias}`,
    `- Liens partageant ce template : ${plan.template?.linksUsingTemplate ?? 0}`,
    "",
    "## Bloquants",
    "",
    plan.blockers.length === 0 ? "Aucun." : plan.blockers.map((item) => `- ${item}`).join("\n"),
    "",
    "## Avertissements",
    "",
    plan.warnings.length === 0 ? "Aucun." : plan.warnings.map((item) => `- ${item}`).join("\n"),
    "",
    "## Configuration proposée",
    "",
    plan.proposedConfig === null
      ? "Aucune configuration proposée."
      : [
          `- Mode : ${plan.proposedConfig.behaviorMode}`,
          `- Prompt historique : ${plan.proposedConfig.systemPrompt.length} caractères`,
          `- Fiches : ${plan.proposedConfig.fiches.length}`,
          `- Sélection de données : ${plan.proposedConfig.dataSelection.mode}`,
        ].join("\n"),
    "",
    "Aucune écriture n'a été effectuée.",
    "",
  ];
  return lines.join("\n");
}
