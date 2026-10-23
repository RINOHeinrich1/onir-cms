import { randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureTemplateReaderFresh,
  getTemplateReaderStatus,
  rotateTemplateReaderPassword,
  testTemplateReaderConnection,
  updateTemplateReaderValidity,
} from "@/application/use-cases/visual-templates/manage-template-reader";
import { getTemplateDataExecutor } from "@/infrastructure/db/template-data-runtime";
import { pgTemplateReaderAccountStore } from "@/infrastructure/db/template-reader-account-store";
import { pgTemplateReaderCredentialsRepository } from "@/infrastructure/db/template-reader-credentials-repository";
import { pgTemplateReaderProvisioner } from "@/infrastructure/db/template-reader-provisioner";
import { sealSecret } from "@/lib/secret-box";
import { setupDb } from "./helpers/db";

describe("compte de lecture administré depuis le panneau (ADR-0026)", () => {
  let pool: Pool;
  let deps: {
    credentials: ReturnType<typeof pgTemplateReaderCredentialsRepository>;
    provisioner: ReturnType<typeof pgTemplateReaderProvisioner>;
    accounts: ReturnType<typeof pgTemplateReaderAccountStore>;
  };

  beforeAll(async () => {
    process.env.SESSION_SECRET = "test-session-secret-reader-account";
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    delete process.env.TEMPLATE_DATABASE_URL;
    pool = await setupDb();
    deps = {
      credentials: pgTemplateReaderCredentialsRepository(pool),
      provisioner: pgTemplateReaderProvisioner(pool),
      accounts: pgTemplateReaderAccountStore(pool),
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  it("génère, applique et stocke un mot de passe", async () => {
    const statusBefore = await getTemplateReaderStatus(deps);
    expect(statusBefore.configured).toBe(false);

    const rotated = await rotateTemplateReaderPassword(deps, null);
    expect(rotated.password).toMatch(/^[0-9a-f]{48}$/);
    expect(rotated.status.configured).toBe(true);
    expect(rotated.status.revision).toBe(1);

    const stored = await deps.credentials.find();
    expect(stored?.sealed.ciphertext).not.toContain(rotated.password);
    expect(stored?.revision).toBe(1);
  });

  it("le runtime se connecte avec le compte stocké", async () => {
    const executor = await getTemplateDataExecutor(pool);
    const result = await executor.execute({
      sql: "SELECT current_user AS who",
      organizationId: "00000000-0000-0000-0000-000000000025",
    });
    expect(result.rows[0]?.who).toBe("template_reader");

    const test = await testTemplateReaderConnection(deps);
    expect(test).toEqual({ ok: true, user: "template_reader_login", source: "database" });
  });

  it("une rotation change la révision et la connexion reste fonctionnelle", async () => {
    const rotated = await rotateTemplateReaderPassword(deps, null);
    expect(rotated.status.revision).toBe(2);
    const executor = await getTemplateDataExecutor(pool);
    const result = await executor.execute({
      sql: "SELECT current_user AS who",
      organizationId: "00000000-0000-0000-0000-000000000025",
    });
    expect(result.rows[0]?.who).toBe("template_reader");
  });

  it("applique et retire la durée de validité sur le rôle PostgreSQL", async () => {
    const rotated = await rotateTemplateReaderPassword(deps, null, 30);
    expect(rotated.status.validityDays).toBe(30);
    expect(rotated.status.expiresAt).not.toBeNull();
    const role = await pool.query<{ rolvaliduntil: Date | null }>(
      "SELECT rolvaliduntil FROM pg_roles WHERE rolname = 'template_reader_login'",
    );
    const validUntil = role.rows[0]?.rolvaliduntil;
    if (validUntil === null || validUntil === undefined) {
      throw new Error("VALID UNTIL non appliqué");
    }
    const remainingDays = (validUntil.getTime() - Date.now()) / 86_400_000;
    expect(remainingDays).toBeGreaterThan(29);
    expect(remainingDays).toBeLessThan(31);

    const unlimited = await updateTemplateReaderValidity(deps, null, 0);
    expect(unlimited.validityDays).toBe(0);
    expect(unlimited.expiresAt).toBeNull();
    const after = await pool.query<{ valid_until: string }>(
      "SELECT rolvaliduntil::text AS valid_until FROM pg_roles WHERE rolname = 'template_reader_login'",
    );
    expect(after.rows[0]?.valid_until).toBe("infinity");
  });

  it("renouvelle automatiquement avant une échéance courte", async () => {
    const rotated = await rotateTemplateReaderPassword(deps, null, 1);
    expect(rotated.status.validityDays).toBe(1);
    await pool.query(
      "UPDATE template_reader_credentials SET expires_at = now() - interval '1 day'",
    );
    const before = await deps.credentials.find();
    const fresh = await ensureTemplateReaderFresh(deps);
    expect(fresh?.revision).toBe((before?.revision ?? 0) + 1);
  });

  it("annule le rôle et le secret si l'écriture du secret échoue", async () => {
    const before = await deps.credentials.find();
    const revision = before?.revision ?? 0;
    const password = randomBytes(24).toString("hex");
    await expect(
      deps.accounts.rotate({
        password,
        validUntil: null,
        sealed: sealSecret(password),
        actorId: null,
        validityDays: 9999,
        expiresAt: null,
      }),
    ).rejects.toBeTruthy();
    const after = await deps.credentials.find();
    expect(after?.revision).toBe(revision);
    const test = await testTemplateReaderConnection(deps);
    expect(test.ok).toBe(true);
  });
});
