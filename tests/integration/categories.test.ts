import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ValidationError } from "@/application/errors";
import { pgCategoryRepository } from "@/infrastructure/db/category-repository";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

describe("catégories (ADR-0027)", () => {
  let pool: Pool;
  let org: string;
  let otherOrg: string;
  let userId: string;

  beforeAll(async () => {
    pool = await setupDb();
    org = await makeOrganization(pool, "Org catégories");
    otherOrg = await makeOrganization(pool, "Org catégories bis");
    userId = await makeUser(pool, "categories@example.test");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crée une taxonomie, affecte un média et expose une clé scalaire", async () => {
    const repo = pgCategoryRepository(pool);
    const produits = await repo.create(org, {
      label: "Produits",
      slug: "produits",
      description: "",
      actif: true,
      position: 1,
      createdBy: userId,
    });
    const promo = await repo.create(org, {
      label: "Promotion",
      slug: "promotion",
      description: "",
      actif: true,
      position: 2,
      createdBy: userId,
    });
    const media = await pool.query<{ id: string }>(
      `INSERT INTO medias (organization_id, type, libelle, url)
       VALUES ($1, 'lien', 'Image test', 'https://example.test/image') RETURNING id`,
      [org],
    );
    const mediaId = media.rows[0]?.id;
    if (mediaId === undefined) throw new Error("Média de test non créé");

    const assigned = await repo.setForContent(org, "media", mediaId, [produits.id, promo.id]);
    expect(assigned.map((entry) => entry.label)).toEqual(["Produits", "Promotion"]);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.organization_id', $1, true)", [org]);
      const rows = await client.query<{
        media_id: string;
        category_id: string;
        category_label: string;
        media_url: string;
        media_libelle: string;
      }>(
        `SELECT media_id, category_id, category_label, media_url, media_libelle
           FROM template_read.v_media_categories WHERE media_id = $1
          ORDER BY category_label`,
        [mediaId],
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows[0]?.media_id).toBe(mediaId);
      expect(rows.rows[0]?.category_id).toBe(produits.id);
      expect(rows.rows[0]?.category_label).toBe("Produits");
      expect(rows.rows[0]?.media_url).toBe("https://example.test/image");
      expect(rows.rows[0]?.media_libelle).toBe("Image test");
      const categories = await client.query("SELECT id FROM template_read.v_categories");
      expect(categories.rowCount).toBe(2);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });

  it("refuse une catégorie d'une autre organisation", async () => {
    const repo = pgCategoryRepository(pool);
    const foreign = await repo.create(otherOrg, {
      label: "Autre",
      slug: "autre",
      description: "",
      actif: true,
      position: 0,
      createdBy: userId,
    });
    const media = await pool.query<{ id: string }>(
      `INSERT INTO medias (organization_id, type, libelle, url)
       VALUES ($1, 'lien', 'Image autre', 'https://example.test/autre') RETURNING id`,
      [org],
    );
    const mediaId = media.rows[0]?.id;
    if (mediaId === undefined) throw new Error("Média de test non créé");
    await expect(repo.setForContent(org, "media", mediaId, [foreign.id])).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("supprime les associations en cascade quand la catégorie disparaît", async () => {
    const repo = pgCategoryRepository(pool);
    const category = await repo.create(org, {
      label: "Temporaire",
      slug: "temporaire",
      description: "",
      actif: true,
      position: 0,
      createdBy: userId,
    });
    const media = await pool.query<{ id: string }>(
      `INSERT INTO medias (organization_id, type, libelle, url)
       VALUES ($1, 'lien', 'Image temporaire', 'https://example.test/tmp') RETURNING id`,
      [org],
    );
    const mediaId = media.rows[0]?.id;
    if (mediaId === undefined) throw new Error("Média de test non créé");
    await repo.setForContent(org, "media", mediaId, [category.id]);
    expect(await repo.delete(org, category.id)).toBe(true);
    expect(await repo.listForContent(org, "media", mediaId)).toEqual([]);
  });
});
