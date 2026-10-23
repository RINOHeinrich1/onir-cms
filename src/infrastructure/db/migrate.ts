/**
 * Runner de migrations (A015) — applique les `migrations/*.sql` dans l'ordre,
 * de façon idempotente, en traçant les fichiers appliqués dans `schema_migrations`.
 * Chaque migration s'exécute dans une transaction (tout ou rien).
 *
 * CLI : `npm run db:migrate` (via `migrate.cli.ts`).
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPool } from "./pool";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(): Promise<string[]> {
  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();

  const applied: string[] = [];

  for (const name of files) {
    const already = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
    if ((already.rowCount ?? 0) > 0) continue;

    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
      await client.query("COMMIT");
      applied.push(name);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  return applied;
}
