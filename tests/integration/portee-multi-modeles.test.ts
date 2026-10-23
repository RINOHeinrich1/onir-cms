import type { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { makeOrganization, setupDb } from "./helpers/db";

let pool: Pool;
let orgId: string;

beforeAll(async () => {
  pool = await setupDb();
  orgId = await makeOrganization(pool, "Portee");
});

afterAll(async () => {
  await pool.end();
});

describe("portée multi-modèles — connaissances", () => {
  it("ne retient que les entrées globales et celles du modèle demandé", async () => {
    const repo = pgConnaissanceRepository(pool);
    await repo.create(orgId, { titre: "Globale", contenu: "A", templateKeys: [], createdBy: null });
    await repo.create(orgId, {
      titre: "Modele A",
      contenu: "B",
      templateKeys: ["modele-a"],
      createdBy: null,
    });
    await repo.create(orgId, {
      titre: "A et B",
      contenu: "C",
      templateKeys: ["modele-a", "modele-b"],
      createdBy: null,
    });

    const pourA = (await repo.listActives(orgId, "modele-a")).map((row) => row.titre).sort();
    const pourB = (await repo.listActives(orgId, "modele-b")).map((row) => row.titre).sort();
    const pourC = (await repo.listActives(orgId, "modele-c")).map((row) => row.titre);

    expect(pourA).toEqual(["A et B", "Globale", "Modele A"]);
    expect(pourB).toEqual(["A et B", "Globale"]);
    expect(pourC).toEqual(["Globale"]);
  });
});

describe("portée multi-modèles — médias", () => {
  it("applique la même visibilité aux photos et aux liens", async () => {
    const repo = pgMediaRepository(pool);
    for (const type of ["photo", "lien"] as const) {
      await repo.create(orgId, {
        type,
        libelle: `${type} globale`,
        description: "",
        templateKeys: [],
        actif: true,
        fichier: type === "photo" ? `${type}.png` : null,
        mime: type === "photo" ? "image/png" : null,
        url: type === "lien" ? "https://onirtech.com/global" : null,
        createdBy: null,
      });
      await repo.create(orgId, {
        type,
        libelle: `${type} modele-a`,
        description: "",
        templateKeys: ["modele-a"],
        actif: true,
        fichier: type === "photo" ? `${type}-a.png` : null,
        mime: type === "photo" ? "image/png" : null,
        url: type === "lien" ? "https://onirtech.com/a" : null,
        createdBy: null,
      });
    }

    const photosA = (await repo.listActivesByType(orgId, "photo", "modele-a")).map(
      (row) => row.libelle,
    );
    const photosB = (await repo.listActivesByType(orgId, "photo", "modele-b")).map(
      (row) => row.libelle,
    );
    const liensA = (await repo.listActivesByType(orgId, "lien", "modele-a")).map(
      (row) => row.libelle,
    );
    const liensB = (await repo.listActivesByType(orgId, "lien", "modele-b")).map(
      (row) => row.libelle,
    );

    expect(photosA.sort()).toEqual(["photo globale", "photo modele-a"]);
    expect(photosB).toEqual(["photo globale"]);
    expect(liensA.sort()).toEqual(["lien globale", "lien modele-a"]);
    expect(liensB).toEqual(["lien globale"]);
  });
});
