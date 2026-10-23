/**
 * Vérification d'intégrité tenant après migration (ADR-0025, A118).
 * Bloque un déploiement si le backfill est incomplet : aucun `organization_id`
 * nul, aucune FK orpheline, memberships cohérentes.
 *
 * CLI : `npm run db:verify-tenant` (exit 1 si invariant cassé).
 */

import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { getPool } from "./pool";

const TENANT_TABLES = [
  "prospects",
  "chat_links",
  "conversations",
  "fiches",
  "chat_templates",
  "base_connaissances",
  "medias",
  "confidentialites",
] as const;

export type TenantIntegrityReport = {
  ok: boolean;
  errors: string[];
  warnings: string[];
};

export async function verifyTenantIntegrity(pool: Pool): Promise<TenantIntegrityReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const table of TENANT_TABLES) {
    const nulls = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM ${table} WHERE organization_id IS NULL`,
    );
    if ((nulls.rows[0]?.count ?? 0) > 0) {
      errors.push(`${table}: ${nulls.rows[0]?.count} ligne(s) sans organization_id`);
    }

    const orphans = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM ${table} t
         LEFT JOIN organizations o ON o.id = t.organization_id
        WHERE o.id IS NULL`,
    );
    if ((orphans.rows[0]?.count ?? 0) > 0) {
      errors.push(`${table}: ${orphans.rows[0]?.count} organization_id orphelin(s)`);
    }
  }

  const membershipOrphans = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM organization_members m
       LEFT JOIN organizations o ON o.id = m.organization_id
       LEFT JOIN users u ON u.id = m.user_id
      WHERE o.id IS NULL OR u.id IS NULL`,
  );
  if ((membershipOrphans.rows[0]?.count ?? 0) > 0) {
    errors.push(
      `organization_members: ${membershipOrphans.rows[0]?.count} membership(s) orpheline(s)`,
    );
  }

  const invalidRoles = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM organization_members
      WHERE role NOT IN ('admin', 'marketeur', 'lecteur')`,
  );
  if ((invalidRoles.rows[0]?.count ?? 0) > 0) {
    errors.push(`organization_members: ${invalidRoles.rows[0]?.count} rôle(s) invalide(s)`);
  }

  const duplicateLocalKeys = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM (
       SELECT organization_id, lower(key) FROM chat_templates
        GROUP BY organization_id, lower(key) HAVING count(*) > 1
     ) duplicates`,
  );
  if ((duplicateLocalKeys.rows[0]?.count ?? 0) > 0) {
    errors.push(
      `chat_templates: ${duplicateLocalKeys.rows[0]?.count} clé(s) locale(s) dupliquée(s)`,
    );
  }

  const superAdmins = await pool.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM users WHERE is_super_admin = true",
  );
  if ((superAdmins.rows[0]?.count ?? 0) === 0) {
    warnings.push("Aucun super-admin (normal sur une installation neuve avant `db:seed`)");
  }

  const orgsWithoutAdmin = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count
       FROM organizations o
      WHERE NOT EXISTS (
        SELECT 1 FROM organization_members m
         WHERE m.organization_id = o.id AND m.role = 'admin'
      )`,
  );
  if ((orgsWithoutAdmin.rows[0]?.count ?? 0) > 0) {
    warnings.push(
      `${orgsWithoutAdmin.rows[0]?.count} organisation(s) sans admin (rattachement explicite attendu)`,
    );
  }

  return { ok: errors.length === 0, errors, warnings };
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const pool = getPool();
  verifyTenantIntegrity(pool)
    .then((report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (!report.ok) process.exitCode = 1;
    })
    .catch((error: unknown) => {
      process.stderr.write(`Échec de la vérification tenant : ${String(error)}\n`);
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
