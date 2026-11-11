import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StorageQuotaExceededError } from "@/application/errors";
import { pgStorageQuotaRepository } from "@/infrastructure/db/storage-quota-repository";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgId: string;

beforeAll(async () => {
  pool = await setupDb();
  orgId = await makeOrganization(pool, "Org stockage");
});

beforeEach(async () => {
  await pool.query("DELETE FROM medias WHERE organization_id = $1", [orgId]);
  await pool.query("DELETE FROM conversation_attachments WHERE organization_id = $1", [orgId]);
  await pool.query("DELETE FROM template_param_assets WHERE organization_id = $1", [orgId]);
  await pool.query("UPDATE organizations SET max_storage_bytes = NULL WHERE id = $1", [orgId]);
});

afterAll(async () => {
  await pool.end();
});

describe("quota global de stockage", () => {
  it("bloque quand le quota est dépassé", async () => {
    await pool.query("UPDATE organizations SET max_storage_bytes = 100 WHERE id = $1", [orgId]);
    await pool.query(
      `INSERT INTO medias (organization_id, type, libelle, fichier, mime, size_bytes)
       VALUES ($1, 'photo', 'photo test', 'k', 'image/png', 60)`,
      [orgId],
    );
    const quotas = pgStorageQuotaRepository(pool);
    await expect(quotas.assertCanStore(orgId, 40)).resolves.toBeUndefined();
    await expect(quotas.assertCanStore(orgId, 41)).rejects.toBeInstanceOf(
      StorageQuotaExceededError,
    );
  });

  it("ne limite pas quand max_storage_bytes est NULL", async () => {
    const quotas = pgStorageQuotaRepository(pool);
    await expect(quotas.assertCanStore(orgId, 10_000_000)).resolves.toBeUndefined();
  });
});
