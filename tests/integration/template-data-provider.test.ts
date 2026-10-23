import { Client, type Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createTemplateQueryExecutor,
  type TemplateQueryExecutorHandle,
} from "@/infrastructure/db/template-query-executor";
import { listTemplateReadViews } from "@/infrastructure/db/template-schema-catalog";
import {
  makeOrganization,
  provisionTemplateReader,
  templateReaderUrl as readerUrl,
  setupDb,
} from "./helpers/db";

describe("fournisseur SQL des templates (ADR-0026)", () => {
  let pool: Pool;
  let executor: TemplateQueryExecutorHandle;
  let orgA: string;
  let orgB: string;

  beforeAll(async () => {
    pool = await setupDb();
    // Rôle de connexion dédié (le rôle `template_reader` est créé NOLOGIN par la migration).
    await provisionTemplateReader(pool);

    orgA = await makeOrganization(pool, "Org A");
    orgB = await makeOrganization(pool, "Org B");
    await pool.query(
      `INSERT INTO medias (organization_id, type, libelle, template_keys, actif, url)
       VALUES ($1, 'lien', 'Lien A1', '{}', true, 'https://example.com/a1'),
              ($1, 'lien', 'Lien A2', '{}', true, 'https://example.com/a2'),
              ($1, 'lien', 'Lien A3', '{}', false, 'https://example.com/a3'),
              ($2, 'lien', 'Lien B1', '{}', true, 'https://example.com/b1')`,
      [orgA, orgB],
    );
    await pool.query(
      `INSERT INTO base_connaissances (organization_id, titre, contenu, template_keys)
       VALUES ($1, 'Tarifs', 'Grille tarifaire A', '{}'),
              ($2, 'Tarifs', 'Grille tarifaire B', '{}')`,
      [orgA, orgB],
    );

    executor = createTemplateQueryExecutor({ connectionString: readerUrl() });
  });

  afterAll(async () => {
    await executor.close();
    await pool.end();
  });

  it("expose le catalogue des vues avec descriptions, sans organization_id", async () => {
    const views = await listTemplateReadViews(pool);
    const connaissances = views.find((entry) => entry.name === "v_connaissances");
    expect(connaissances).toBeDefined();
    expect(connaissances?.description).toContain("Contenus de connaissance");
    const title = connaissances?.columns.find((column) => column.name === "titre");
    expect(title?.description).toBe("Titre affiché du contenu.");
    expect(title?.type).toBe("text");
    expect(connaissances?.columns.some((column) => column.name === "organization_id")).toBe(false);
    expect(views.some((entry) => entry.name === "v_medias")).toBe(true);
  });

  it("se connecte sous le rôle lecture seule", async () => {
    const result = await executor.execute({
      sql: "SELECT current_user AS who",
      organizationId: orgA,
    });
    expect(result.rows).toEqual([{ who: "template_reader" }]);
  });

  it("ne lit que l'organisation courante", async () => {
    const a = await executor.execute({
      sql: "SELECT libelle FROM template_read.v_medias ORDER BY libelle",
      organizationId: orgA,
    });
    expect(a.rows.map((row) => row.libelle)).toEqual(["Lien A1", "Lien A2", "Lien A3"]);

    const b = await executor.execute({
      sql: "SELECT libelle FROM template_read.v_medias ORDER BY libelle",
      organizationId: orgB,
    });
    expect(b.rows.map((row) => row.libelle)).toEqual(["Lien B1"]);
  });

  it("transmet les paramètres positionnels", async () => {
    const result = await executor.execute({
      sql: "SELECT contenu FROM template_read.v_connaissances WHERE titre = $1",
      params: ["Tarifs"],
      organizationId: orgA,
    });
    expect(result.rows).toEqual([{ contenu: "Grille tarifaire A" }]);
  });

  it("tronque au plafond de lignes", async () => {
    const result = await executor.execute({
      sql: "SELECT libelle FROM template_read.v_medias ORDER BY libelle",
      organizationId: orgA,
      maxRows: 2,
    });
    expect(result.rows).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });

  it("refuse les tables internes", async () => {
    await expect(
      executor.execute({ sql: "SELECT * FROM public.medias", organizationId: orgA }),
    ).rejects.toMatchObject({ code: "DATA_UNAUTHORIZED" });
  });

  it("refuse l'écriture (garde, CTE data-modifying, privilèges)", async () => {
    await expect(
      executor.execute({
        sql: "UPDATE template_read.v_medias SET libelle = 'x'",
        organizationId: orgA,
      }),
    ).rejects.toMatchObject({ code: "DATA_PROVIDER_ERROR" });

    await expect(
      executor.execute({
        sql: "WITH x AS (DELETE FROM template_read.v_medias RETURNING id) SELECT * FROM x",
        organizationId: orgA,
      }),
    ).rejects.toMatchObject({ code: "DATA_PROVIDER_ERROR" });

    const client = new Client({ connectionString: readerUrl() });
    await client.connect();
    try {
      await client.query("BEGIN READ ONLY");
      await expect(client.query("DELETE FROM template_read.v_medias")).rejects.toMatchObject({
        code: expect.stringMatching(/^(42501|25006)$/),
      });
    } finally {
      await client.query("ROLLBACK").catch(() => undefined);
      await client.end();
    }
  });

  it("refuse plusieurs instructions", async () => {
    await expect(
      executor.execute({
        sql: "SELECT 1; DROP TABLE medias",
        organizationId: orgA,
      }),
    ).rejects.toMatchObject({ code: "DATA_PROVIDER_ERROR" });
  });

  it("interrompt une requête trop longue", async () => {
    await expect(
      executor.execute({ sql: "SELECT pg_sleep(0.5)", organizationId: orgA, timeoutMs: 100 }),
    ).rejects.toMatchObject({ code: "DATA_TIMEOUT" });
  });

  it("ne renvoie rien sans organisation posée (fail-closed)", async () => {
    const client = new Client({ connectionString: readerUrl() });
    await client.connect();
    try {
      const { rows } = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM template_read.v_medias",
      );
      expect(rows[0]?.count).toBe("0");
    } finally {
      await client.end();
    }
  });
});
