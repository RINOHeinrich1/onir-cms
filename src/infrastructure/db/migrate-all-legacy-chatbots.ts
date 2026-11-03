import type { Pool } from "pg";
import { auditLegacyChatbots } from "./audit-legacy-chatbots";
import { migrateLegacyChatbot } from "./migrate-legacy-chatbot";
import { planLegacyChatbotMigration } from "./plan-legacy-chatbot-migration";

export type LegacyBatchStatus = "migrated" | "planned" | "blocked" | "skipped" | "failed";

export type LegacyBatchEntry = {
  linkId: string;
  organization: string;
  label: string;
  templateKey: string;
  templateVersion: number;
  status: LegacyBatchStatus;
  configId: string | null;
  version: number | null;
  blockers: string[];
  warnings: string[];
};

export type LegacyBatchResult = {
  generatedAt: string;
  execute: boolean;
  allowOpenConversations: boolean;
  totalLegacy: number;
  migrated: number;
  planned: number;
  blocked: number;
  skipped: number;
  failed: number;
  remainingLegacy: number;
  entries: LegacyBatchEntry[];
};

type BatchOptions = {
  execute?: boolean;
  allowOpenConversations?: boolean;
};

type BatchDependencies = {
  audit: typeof auditLegacyChatbots;
  plan: typeof planLegacyChatbotMigration;
  migrate: typeof migrateLegacyChatbot;
};

const DEFAULT_DEPENDENCIES: BatchDependencies = {
  audit: auditLegacyChatbots,
  plan: planLegacyChatbotMigration,
  migrate: migrateLegacyChatbot,
};

function count(entries: readonly LegacyBatchEntry[], status: LegacyBatchStatus): number {
  return entries.filter((entry) => entry.status === status).length;
}

/**
 * Migre tous les liens legacy vers une configuration (fiche de collecte).
 * Dry-run par défaut ; `execute: true` applique. Idempotent : les liens déjà
 * configurés ou bloqués sont signalés, jamais écrasés. Une erreur sur un lien
 * n'interrompt pas les autres.
 */
export async function migrateAllLegacyChatbots(
  pool: Pool,
  options: BatchOptions = {},
  dependencies: Partial<BatchDependencies> = {},
): Promise<LegacyBatchResult> {
  const deps = { ...DEFAULT_DEPENDENCIES, ...dependencies };
  const before = await deps.audit(pool);
  const entries: LegacyBatchEntry[] = [];

  for (const link of before.links) {
    const base = {
      linkId: link.id,
      organization: link.organization,
      label: link.label,
      templateKey: link.templateKey,
      templateVersion: link.templateVersion,
    };
    try {
      const plan = await deps.plan(pool, link.id);
      const blockers = [...plan.blockers];
      if (plan.link.alreadyConfigured) blockers.push("Lien déjà configuré");
      if (plan.link.openConversations > 0 && options.allowOpenConversations !== true) {
        blockers.push(
          `${plan.link.openConversations} conversation(s) ouverte(s) : --allow-open requis`,
        );
      }
      if (plan.proposedConfig === null) blockers.push("Aucune configuration proposée");

      if (blockers.length > 0) {
        const alreadyConfigured = plan.link.alreadyConfigured && plan.blockers.length === 0;
        entries.push({
          ...base,
          status: alreadyConfigured ? "skipped" : "blocked",
          configId: null,
          version: null,
          blockers,
          warnings: plan.warnings,
        });
        continue;
      }

      if (options.execute !== true) {
        entries.push({
          ...base,
          status: "planned",
          configId: null,
          version: null,
          blockers: [],
          warnings: plan.warnings,
        });
        continue;
      }

      const migrated = await deps.migrate(
        pool,
        link.id,
        options.allowOpenConversations === true ? { allowOpenConversations: true } : {},
      );
      entries.push({
        ...base,
        status: "migrated",
        configId: migrated.configId,
        version: migrated.version,
        blockers: [],
        warnings: plan.warnings,
      });
    } catch (error) {
      entries.push({
        ...base,
        status: "failed",
        configId: null,
        version: null,
        blockers: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      });
    }
  }

  const after = options.execute === true ? await deps.audit(pool) : before;
  return {
    generatedAt: new Date().toISOString(),
    execute: options.execute === true,
    allowOpenConversations: options.allowOpenConversations === true,
    totalLegacy: before.summary.legacyLinks,
    migrated: count(entries, "migrated"),
    planned: count(entries, "planned"),
    blocked: count(entries, "blocked"),
    skipped: count(entries, "skipped"),
    failed: count(entries, "failed"),
    remainingLegacy: after.summary.legacyLinks,
    entries,
  };
}

export function formatLegacyBatchResult(result: LegacyBatchResult): string {
  const lines = [
    "# Migration de tous les chatbots legacy",
    "",
    `- Généré le : ${result.generatedAt}`,
    `- Mode : ${result.execute ? "exécution" : "dry-run (aucune écriture)"}`,
    `- Conversations ouvertes autorisées : ${result.allowOpenConversations ? "oui" : "non"}`,
    `- Liens legacy au départ : ${result.totalLegacy}`,
    `- Migrés : ${result.migrated}`,
    `- Planifiés : ${result.planned}`,
    `- Bloqués : ${result.blocked}`,
    `- Ignorés : ${result.skipped}`,
    `- Échecs : ${result.failed}`,
    `- Liens legacy restants : ${result.remainingLegacy}`,
    "",
    "## Détail",
    "",
  ];
  if (result.entries.length === 0) {
    lines.push("Aucun lien legacy.");
  } else {
    for (const entry of result.entries) {
      const target =
        entry.configId === null
          ? ""
          : ` → configuration ${entry.configId} (v${entry.version ?? "?"})`;
      lines.push(
        `- [${entry.status}] ${entry.organization} — ${entry.label} (${entry.templateKey} v${entry.templateVersion})${target}`,
      );
      for (const blocker of entry.blockers) lines.push(`  - bloquant : ${blocker}`);
      for (const warning of entry.warnings) lines.push(`  - avertissement : ${warning}`);
    }
  }
  lines.push(
    "",
    result.execute
      ? "Migration exécutée. Vérifier les liens restants ci-dessus avant de supprimer le legacy."
      : "Dry-run : relancer avec --execute pour appliquer.",
    "",
  );
  return lines.join("\n");
}
