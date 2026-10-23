/**
 * CLI autonome de maintenance de la base.
 * Utilisé par l'image Docker `migrate` (bundle esbuild, sans sources).
 *
 * Usage : node dist/db-cli.mjs [migrate|seed|migrate-and-seed]
 */

import { migrate } from "./migrate";
import { getPool } from "./pool";
import { seedAdmin } from "./seed-admin";

type Command = "migrate" | "seed" | "migrate-and-seed";

const COMMANDS: readonly Command[] = ["migrate", "seed", "migrate-and-seed"];

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
