/**
 * CLI autonome de maintenance de la base.
 * Utilisé par l'image Docker `migrate` (bundle esbuild, sans sources).
 *
 * Usage : node dist/db-cli.mjs [migrate|seed|migrate-and-seed|backup|audit-legacy-chatbots [--format=json]|plan-legacy-chatbot --link-id=<uuid> [--format=json]|migrate-legacy-chatbot --link-id=<uuid> [--execute] [--allow-open]|reset-all-chatbot-data [--execute]]
 */

import { auditLegacyChatbots, formatLegacyChatbotAudit } from "./audit-legacy-chatbots";
import { backupDatabase } from "./backup-database";
import { migrate } from "./migrate";
import { formatLegacyMigrationResult, migrateLegacyChatbot } from "./migrate-legacy-chatbot";
import {
  formatLegacyMigrationPlan,
  planLegacyChatbotMigration,
} from "./plan-legacy-chatbot-migration";
import { getPool } from "./pool";
import { resetChatbotTestData } from "./reset-chatbot-test-data";
import { seedAdmin } from "./seed-admin";

type Command =
  | "migrate"
  | "seed"
  | "migrate-and-seed"
  | "backup"
  | "audit-legacy-chatbots"
  | "plan-legacy-chatbot"
  | "migrate-legacy-chatbot"
  | "reset-all-chatbot-data";

const COMMANDS: readonly Command[] = [
  "migrate",
  "seed",
  "migrate-and-seed",
  "backup",
  "audit-legacy-chatbots",
  "plan-legacy-chatbot",
  "migrate-legacy-chatbot",
  "reset-all-chatbot-data",
];

function parseCommand(value: string | undefined): Command {
  const command = value ?? "migrate-and-seed";
  if (!COMMANDS.includes(command as Command)) {
    throw new Error(`Commande inconnue : « ${command} ». Attendu : ${COMMANDS.join(", ")}.`);
  }
  return command as Command;
}

async function main(): Promise<void> {
  const command = parseCommand(process.argv[2]);
  const pool = getPool();

  try {
    if (command === "backup") {
      await backupDatabase();
      return;
    }

    if (command === "audit-legacy-chatbots") {
      const result = await auditLegacyChatbots(pool);
      process.stdout.write(
        process.argv.includes("--format=json")
          ? `${JSON.stringify(result, null, 2)}\n`
          : `${formatLegacyChatbotAudit(result)}\n`,
      );
      return;
    }

    if (command === "plan-legacy-chatbot" || command === "migrate-legacy-chatbot") {
      const arg = process.argv.find((value) => value.startsWith("--link-id="));
      const linkId = arg?.slice("--link-id=".length).trim() ?? "";
      if (linkId === "") {
        throw new Error(`--link-id=<uuid> est obligatoire pour ${command}`);
      }
      if (command === "plan-legacy-chatbot") {
        const result = await planLegacyChatbotMigration(pool, linkId);
        process.stdout.write(
          process.argv.includes("--format=json")
            ? `${JSON.stringify(result, null, 2)}\n`
            : `${formatLegacyMigrationPlan(result)}\n`,
        );
        return;
      }
      if (!process.argv.includes("--execute")) {
        const result = await planLegacyChatbotMigration(pool, linkId);
        process.stdout.write(
          `${formatLegacyMigrationPlan(result)}\nDry-run : relancer avec --execute pour appliquer.\n`,
        );
        return;
      }
      const result = await migrateLegacyChatbot(pool, linkId, {
        allowOpenConversations: process.argv.includes("--allow-open"),
      });
      process.stdout.write(
        process.argv.includes("--format=json")
          ? `${JSON.stringify(result, null, 2)}\n`
          : `${formatLegacyMigrationResult(result)}\n`,
      );
      return;
    }

    if (command === "reset-all-chatbot-data") {
      await resetChatbotTestData(process.argv.includes("--execute"));
      return;
    }

    if (command === "migrate" || command === "migrate-and-seed") {
      const applied = await migrate();
      const summary =
        applied.length > 0
          ? `Migrations appliquées : ${applied.join(", ")}`
          : "Aucune migration à appliquer.";
      process.stdout.write(`${summary}\n`);
    }

    if (command === "seed" || command === "migrate-and-seed") {
      const result = await seedAdmin();
      const summary = result.created
        ? `Administrateur créé : ${result.email} (super-admin, rotation forcée)`
        : `Administrateur déjà présent : ${result.email}`;
      process.stdout.write(`${summary}\n`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Échec de la maintenance de la base : ${String(error)}\n`);
  process.exitCode = 1;
});
