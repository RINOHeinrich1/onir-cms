import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { testDatabaseUrl } from "./helpers/db";

/**
 * F019 — preuve de la migration destructive 0082 (ADR-0067 §3).
 *
 * Le test n'applique JAMAIS 0082 sur une base réelle : il exige
 * `TEST_DATABASE_URL` (nom de base contenant « test », cf. helpers/db) et
 * reconstruit entièrement le schéma `public`.
 */

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/infrastructure/db/migrations",
);
const DESTRUCTIVE = "0082_drop_legacy_fiche_columns.sql";
const LEGACY_COLUMNS = [
  "plateformes",
  "description",
  "budget",
  "duree",
  "contact",
  "statut",
  "contraintes_techno",
  "lien_doc_spec",
];

let pool: Pool;
let organizationId: string;
let chatLinkId: string;
let ficheCountBefore: number;
let destructiveSql: string;

async function applyMigrations(pool: Pool, includeDestructive: boolean): Promise<void> {
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith(".sql"))
    .filter((name) => includeDestructive || name !== DESTRUCTIVE)
    .sort();
  for (const name of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, name), "utf8");
    await pool.query(sql);
  }
}

/** Exécute 0082 dans une transaction isolée (comme le runner). */
async function runDestructive(pool: Pool, commit: boolean): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(destructiveSql);
    if (commit) await client.query("COMMIT");
    else await client.query("ROLLBACK");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function legacyColumnCount(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'fiches'
        AND column_name = ANY($1::text[])`,
    [LEGACY_COLUMNS],
  );
  return Number(rows[0]?.count ?? "0");
}

async function statutResidues(pool: Pool): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT (
       (SELECT count(*) FROM fiches
         WHERE jsonb_typeof(data) = 'object' AND data ? 'statut')
       + (SELECT count(*) FROM fiches f
           WHERE jsonb_typeof(f.definition->'fields') = 'array'
             AND EXISTS (
               SELECT 1 FROM jsonb_array_elements(f.definition->'fields') AS field
                WHERE field->>'name' = 'statut'
                   OR field->'requiredIf'->>'field' = 'statut'))
       + (SELECT count(*) FROM chatbot_configs c
           WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(c.fiche_definitions) AS def
             CROSS JOIN LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(def->'fields') = 'array' THEN def->'fields'
                    ELSE '[]'::jsonb END
             ) AS field
              WHERE field->>'name' = 'statut'
                 OR field->'requiredIf'->>'field' = 'statut'))
       + (SELECT count(*) FROM fiche_collectes
           WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(fields) AS field
              WHERE field->>'name' = 'statut'
                 OR field->'requiredIf'->>'field' = 'statut'))
       + (SELECT count(*) FROM fiche_collecte_versions
           WHERE EXISTS (
             SELECT 1 FROM jsonb_array_elements(fields) AS field
              WHERE field->>'name' = 'statut'
                 OR field->'requiredIf'->>'field' = 'statut'))
     )::text AS count`,
  );
  return Number(rows[0]?.count ?? "0");
}

beforeAll(async () => {
  pool = new Pool({ connectionString: testDatabaseUrl(), max: 5 });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE");
  await pool.query("CREATE SCHEMA public");
  await applyMigrations(pool, false);
  destructiveSql = await readFile(join(MIGRATIONS_DIR, DESTRUCTIVE), "utf8");

  const org = await pool.query<{ id: string }>(
    "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
    ["Org migration 0082"],
  );
  organizationId = org.rows[0]?.id as string;

  const link = await pool.query<{ id: string }>(
    `INSERT INTO chat_links (organization_id, token_hash, type)
     VALUES ($1, $2, 'standard') RETURNING id`,
    [organizationId, "token-migration-0082"],
  );
  chatLinkId = link.rows[0]?.id as string;

  // Fiche 1 : data vide ⇒ backfill complet depuis les colonnes legacy.
  await pool.query(
    `INSERT INTO fiches
       (organization_id, plateformes, description, budget, duree, contact,
        statut, contraintes_techno, lien_doc_spec, data, definition,
        qualification_status_key)
     VALUES ($1, ARRAY['site web']::text[], 'Desc legacy', '100', '2 mois',
             'contact-1', 'reprendre', 'PHP 5', 'https://doc.example/1',
             '{}'::jsonb,
             $2::jsonb, NULL)`,
    [
      organizationId,
      JSON.stringify({
        key: "legacy",
        label: "Legacy",
        description: "",
        systemPrompt: "",
        fields: [
          { name: "ville", label: "Ville", type: "text", required: true },
          { name: "statut", label: "Statut", type: "select", required: true },
          {
            name: "contraintesTechno",
            label: "Contraintes",
            type: "textarea",
            required: false,
            requiredIf: { field: "statut", equals: "reprendre" },
          },
        ],
        renderTemplate: "# Legacy",
      }),
    ],
  );

  // Fiche 2 : data prioritaire (budget/description), autres clés backfillées.
  await pool.query(
    `INSERT INTO fiches
       (organization_id, plateformes, description, budget, duree, contact,
        statut, contraintes_techno, lien_doc_spec, data, definition,
        qualification_status_key)
     VALUES ($1, ARRAY['mobile']::text[], 'Desc colonne', 'colonne-budget',
             '3 mois', 'contact-2', 'initier', '', '',
             $2::jsonb, NULL, 'qualifie')`,
    [
      organizationId,
      JSON.stringify({ budget: "data-prioritaire", description: "data-desc", statut: "initier" }),
    ],
  );

  const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM fiches");
  ficheCountBefore = Number(count.rows[0]?.count ?? "0");

  await pool.query(
    `INSERT INTO chatbot_configs
       (organization_id, chat_link_id, version, fiche_definitions)
     VALUES ($1, $2, 1, $3::jsonb)`,
    [
      organizationId,
      chatLinkId,
      JSON.stringify([
        {
          key: "legacy",
          label: "Legacy",
          fields: [
            { name: "ville", label: "Ville", type: "text", required: true },
            { name: "statut", label: "Statut", type: "select", required: true },
            {
              name: "contraintesTechno",
              label: "Contraintes",
              type: "textarea",
              required: false,
              requiredIf: { field: "statut", equals: "reprendre" },
            },
          ],
        },
      ]),
    ],
  );

  await pool.query(
    `INSERT INTO fiche_collectes
       (organization_id, key, label, fields)
     VALUES ($1, 'legacy-collecte', 'Legacy collecte', $2::jsonb)`,
    [
      organizationId,
      JSON.stringify([
        { name: "ville", label: "Ville", type: "text", required: true },
        { name: "statut", label: "Statut", type: "select", required: true },
      ]),
    ],
  );

  const collecte = await pool.query<{ id: string }>(
    "SELECT id FROM fiche_collectes WHERE organization_id = $1 AND key = 'legacy-collecte'",
    [organizationId],
  );
  const collecteId = collecte.rows[0]?.id as string;
  await pool.query(
    `INSERT INTO fiche_collecte_versions
       (fiche_collecte_id, version, key, label, fields)
     VALUES ($1, 1, 'legacy-collecte', 'Legacy collecte', $2::jsonb)`,
    [
      collecteId,
      JSON.stringify([
        { name: "ville", label: "Ville", type: "text", required: true },
        {
          name: "contraintesTechno",
          label: "Contraintes",
          type: "textarea",
          required: false,
          requiredIf: { field: "statut", equals: "reprendre" },
        },
      ]),
    ],
  );
});

afterAll(async () => {
  await pool?.end();
});

describe("migration 0082 — nettoyage legacy destructif", () => {
  it("est transactionnelle : un rollback ne supprime aucune colonne", async () => {
    await runDestructive(pool, false);
    expect(await legacyColumnCount(pool)).toBe(LEGACY_COLUMNS.length);
    expect(await statutResidues(pool)).toBeGreaterThan(0);
  });

  it("backfille data, retire le statut et supprime les 8 colonnes", async () => {
    await runDestructive(pool, true);

    // Plus aucune colonne legacy.
    expect(await legacyColumnCount(pool)).toBe(0);
    // Plus aucun résidu du statut historique.
    expect(await statutResidues(pool)).toBe(0);
    // Comptage inchangé.
    const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM fiches");
    expect(Number(count.rows[0]?.count)).toBe(ficheCountBefore);
    // Les colonnes de qualification sont préservées.
    const qualification = await pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='fiches'
          AND column_name LIKE 'qualification_status_%'`,
    );
    expect(qualification.rowCount).toBe(3);

    const { rows } = await pool.query<{
      data: Record<string, unknown>;
      qualification_status_key: string | null;
    }>(
      `SELECT data, qualification_status_key FROM fiches
        WHERE qualification_status_key IS NULL
           OR qualification_status_key = 'qualifie'
        ORDER BY qualification_status_key NULLS FIRST`,
    );
    const backfilled = rows[0];
    expect(backfilled?.qualification_status_key).toBeNull();
    expect(backfilled?.data).toMatchObject({
      plateformes: ["site web"],
      description: "Desc legacy",
      budget: "100",
      duree: "2 mois",
      contact: "contact-1",
      contraintesTechno: "PHP 5",
      lienDocSpec: "https://doc.example/1",
    });
    expect(backfilled?.data).not.toHaveProperty("statut");

    const priority = rows.find((row) => row.qualification_status_key === "qualifie");
    expect(priority?.data).toMatchObject({
      budget: "data-prioritaire",
      description: "data-desc",
      plateformes: ["mobile"],
      duree: "3 mois",
      contact: "contact-2",
    });
    expect(priority?.data).not.toHaveProperty("statut");
  });

  it("est idempotente : un second passage ne change rien", async () => {
    await runDestructive(pool, true);
    expect(await legacyColumnCount(pool)).toBe(0);
    expect(await statutResidues(pool)).toBe(0);
    const count = await pool.query<{ count: string }>("SELECT count(*)::text AS count FROM fiches");
    expect(Number(count.rows[0]?.count)).toBe(ficheCountBefore);
  });
});
