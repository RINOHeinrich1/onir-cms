import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../src/infrastructure/db/migrations",
);

/**
 * Base de test obligatoire : refuse une URL qui ne désigne pas explicitement une
 * base jetable. Aucune exécution ne doit pouvoir toucher la production.
 */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (url === undefined || url.trim() === "") {
    throw new Error("TEST_DATABASE_URL est requis pour les tests d'intégration");
  }
  const database = new URL(url).pathname.replace(/^\//, "");
  if (database === "onir_cms" || !/test|_mt_/i.test(database)) {
    throw new Error(
      `Base de test refusée : « ${database} ». Le nom doit contenir « test » (base jetable).`,
    );
  }
  return url;
}

/** Recrée le schéma public puis applique toutes les migrations dans l'ordre. */
export async function setupDb(): Promise<Pool> {
  const pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");

  const files = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  for (const name of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    await pool.query(sql);
  }
  return pool;
}

export async function makeOrganization(pool: Pool, name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
    [name],
  );
  const row = rows[0];
  if (!row) throw new Error("Échec de création de l'organisation de test");
  return row.id;
}

export async function makeUser(
  pool: Pool,
  email: string,
  options: { superAdmin?: boolean; role?: "admin" | "marketeur" | "lecteur" } = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO users (email, password_hash, role, is_super_admin)
     VALUES ($1, 'test-hash', $2, $3) RETURNING id`,
    [email, options.role ?? "admin", options.superAdmin ?? false],
  );
  const row = rows[0];
  if (!row) throw new Error("Échec de création de l'utilisateur de test");
  return row.id;
}

export async function addMembership(
  pool: Pool,
  organizationId: string,
  userId: string,
  role: "admin" | "marketeur" | "lecteur" = "admin",
): Promise<void> {
  await pool.query(
    `INSERT INTO organization_members (organization_id, user_id, role, created_by)
     VALUES ($1, $2, $3, $2)`,
    [organizationId, userId, role],
  );
}

export const TEMPLATE_READER_PASSWORD = "reader-test";

/**
 * Rôle de connexion dédié au fournisseur SQL (ADR-0026) : membre du rôle
 * `template_reader` créé par la migration 0029, sans privilège propre.
 */
export async function provisionTemplateReader(pool: Pool): Promise<void> {
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'template_reader_login') THEN
        CREATE ROLE template_reader_login LOGIN;
      END IF;
    END
    $$;
  `);
  await pool.query(`ALTER ROLE template_reader_login PASSWORD '${TEMPLATE_READER_PASSWORD}'`);
  await pool.query("GRANT template_reader TO template_reader_login");
}

/** URL de connexion du rôle lecture seule (même base que TEST_DATABASE_URL). */
export function templateReaderUrl(): string {
  const url = new URL(testDatabaseUrl());
  url.username = "template_reader_login";
  url.password = TEMPLATE_READER_PASSWORD;
  return url.toString();
}
