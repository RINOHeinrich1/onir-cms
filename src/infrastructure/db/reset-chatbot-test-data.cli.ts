import { databaseUrl } from "@/lib/env";
import { getPool } from "./pool";

/**
 * Réinitialisation explicite des données de test du domaine chatbot.
 *
 * Ce n'est PAS une migration : la commande n'est jamais exécutée par
 * `db:migrate` et exige une confirmation par variable d'environnement.
 *
 * Usage :
 *   RESET_CHATBOT_TEST_DATA=yes npm run db:reset-chatbot-test-data
 *   RESET_CHATBOT_TEST_DATA=yes npm run db:reset-chatbot-test-data -- --execute
 */

const TABLES = [
  "fiches",
  "conversation_fiche_instances",
  "chatbot_configs",
  "conversations",
  "prospects",
  "chat_links",
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

async function existingTables(
  pool: ReturnType<typeof getPool>,
): Promise<Array<(typeof TABLES)[number]>> {
  const found: Array<(typeof TABLES)[number]> = [];
  for (const table of TABLES) {
    const result = await pool.query<{ present: boolean }>(
      "SELECT to_regclass($1) IS NOT NULL AS present",
      [`public.${table}`],
    );
    if (result.rows[0]?.present === true) found.push(table);
  }
  return found;
}

async function count(pool: ReturnType<typeof getPool>, table: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${quote(table)}`,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  const execute = process.argv.includes("--execute");
  if (process.env.RESET_CHATBOT_TEST_DATA !== "yes") {
    process.stderr.write(
      "Refusé : définissez RESET_CHATBOT_TEST_DATA=yes pour confirmer la réinitialisation.\n",
    );
    process.exitCode = 1;
    return;
  }

  const pool = getPool();
  try {
    const tables = await existingTables(pool);
    if (tables.length === 0) {
      process.stdout.write("Aucune table chatbot trouvée.\n");
      return;
    }

    const counts = new Map<string, number>();
    for (const table of tables) counts.set(table, await count(pool, table));

    process.stdout.write(`Cible : ${target()}\n`);
    process.stdout.write(`Mode : ${execute ? "EXECUTION" : "DRY RUN"}\n`);
    for (const table of tables) {
      process.stdout.write(`- ${table}: ${counts.get(table) ?? 0} ligne(s)\n`);
    }

    if (!execute) {
      process.stdout.write(
        "Aucune suppression effectuée. Relancez avec --execute pour appliquer.\n",
      );
      return;
    }

    await pool.query("BEGIN");
    try {
      await pool.query(`TRUNCATE TABLE ${tables.map(quote).join(", ")} RESTART IDENTITY CASCADE`);
      await pool.query("COMMIT");
    } catch (error) {
      await pool.query("ROLLBACK");
      throw error;
    }

    process.stdout.write("Données de test chatbot supprimées.\n");
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`Échec de la réinitialisation : ${String(error)}\n`);
  process.exitCode = 1;
});
