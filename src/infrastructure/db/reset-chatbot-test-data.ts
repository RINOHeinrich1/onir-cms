import { databaseUrl } from "@/lib/env";
import { backupDatabase } from "./backup-database";
import { getPool } from "./pool";

/**
 * Réinitialisation explicite des données de test du domaine chatbot.
 *
 * Ce n'est PAS une migration : la commande n'est jamais exécutée par
 * `db:migrate` et exige une confirmation par variable d'environnement.
 */

const TABLES = [
  "fiches",
  "conversation_fiche_instances",
  "chatbot_configs",
  "conversations",
  "prospects",
  "chat_links",
  "base_connaissances",
  "medias",
  "webhook_endpoints",
  "chatbot_drafts",
  "fiche_collectes",
  "chat_templates",
] as const;

function quote(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function target(): string {
  try {
    const parsed = new URL(databaseUrl());
    return `${parsed.hostname}/${parsed.pathname.replace(/^\//, "") || "?"}`;
  } catch {
    return "base configurée";
  }
}

export async function resetChatbotTestData(execute: boolean): Promise<void> {
  if (process.env.RESET_ALL_CHATBOT_DATA !== "yes") {
    throw new Error(
      "Refusé : définissez RESET_ALL_CHATBOT_DATA=yes pour confirmer la réinitialisation globale.",
    );
  }

  const pool = getPool();
  const found: string[] = [];
  for (const table of TABLES) {
    const result = await pool.query<{ present: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [`public.${table}`],
    );
    if (result.rows[0]?.present === true) found.push(table);
  }
  if (found.length === 0) {
    process.stdout.write("Aucune table chatbot trouvée.\n");
    return;
  }

  const counts = new Map<string, number>();
  for (const table of found) {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${quote(table)}`,
    );
    counts.set(table, Number(result.rows[0]?.count ?? 0));
  }

  process.stdout.write(`Cible : ${target()}\n`);
  process.stdout.write(`Mode : ${execute ? "EXECUTION" : "DRY RUN"}\n`);
  for (const table of found) {
    process.stdout.write(`- ${table}: ${counts.get(table) ?? 0} ligne(s)\n`);
  }

  if (!execute) {
    process.stdout.write("Aucune suppression effectuée. Relancez avec --execute pour appliquer.\n");
    return;
  }

  if (process.env.BACKUP_DIR === undefined || process.env.BACKUP_DIR.trim() === "") {
    throw new Error(
      "Refusé : BACKUP_DIR est obligatoire pour conserver le dump avant la suppression globale.",
    );
  }

  await backupDatabase();

  await pool.query("BEGIN");
  try {
    await pool.query(`TRUNCATE TABLE ${found.map(quote).join(", ")} RESTART IDENTITY CASCADE`);
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  process.stdout.write("Données chatbot supprimées après sauvegarde.\n");
}
