import { describe, expect, it, vi } from "vitest";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import {
  createConnaissance,
  deleteConnaissance,
  listConnaissances,
  updateConnaissance,
} from "@/application/use-cases/connaissances/manage-connaissances";
import type { Connaissance } from "@/domain/entities/connaissance";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function row(overrides: Partial<Connaissance> = {}): Connaissance {
  return {
    id: "c1",
    organizationId: "org-1",
    titre: "contact de l'entreprise",
    contenu: "contact@example.com",
    templateKeys: [],
    actif: true,
    createdBy: "admin-1",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function repo(current: Connaissance | null) {
  return {
    findById: async () => current,
    findByTitre: async () => null,
    list: async () => (current === null ? [] : [current]),
    create: vi.fn(async (organizationId, input) => row({ organizationId, ...input })),
    update: vi.fn(async (_organizationId: string, id: string, patch: Record<string, unknown>) =>
      current === null || id !== current.id ? null : { ...current, ...patch },
    ),
    delete: vi.fn(async () => current !== null),
    listActives: async () => (current === null ? [] : [current]),
  } satisfies ConnaissanceRepository;
}

describe("manage-connaissances (US-CONNAISS-001)", () => {
  it("liste les entrées", async () => {
    const links = repo(row());
    expect(await listConnaissances({ connaissances: links }, ACTOR)).toHaveLength(1);
  });

  it("crée une entrée valide", async () => {
    const links = repo(null);
    const created = await createConnaissance({ connaissances: links }, ACTOR, {
      titre: "  Tarifs  ",
      contenu: "Sur devis.",
      templateKeys: [],
    });
    expect(created.titre).toBe("Tarifs");
    expect(created.templateKeys).toEqual([]);
  });

  it("normalise la portée multi-modèles (doublons et vides supprimés)", async () => {
    const links = repo(null);
    const created = await createConnaissance({ connaissances: links }, ACTOR, {
      titre: "Tarifs",
      contenu: "Sur devis.",
      templateKeys: [" fiche-projet ", "demo", "fiche-projet", ""],
    });
    expect(created.templateKeys).toEqual(["fiche-projet", "demo"]);
  });

  it("met à jour la portée (tableau vide = globale)", async () => {
    const links = repo(row({ templateKeys: ["fiche-projet"] }));
    const updated = await updateConnaissance({ connaissances: links }, ACTOR, "c1", {
      templateKeys: [],
    });
    expect(updated?.templateKeys).toEqual([]);
  });

  it("refuse un titre vide ou trop long", async () => {
    const links = repo(null);
    await expect(
      createConnaissance({ connaissances: links }, ACTOR, { titre: "", contenu: "x" }),
    ).rejects.toThrow(/obligatoire/);
    await expect(
      createConnaissance({ connaissances: links }, ACTOR, { titre: "x".repeat(121), contenu: "x" }),
    ).rejects.toThrow(/120/);
  });

  it("refuse un titre déjà utilisé", async () => {
    const links: ConnaissanceRepository = {
      ...repo(null),
      findByTitre: async () => row(),
    };
    await expect(
      createConnaissance({ connaissances: links }, ACTOR, {
        titre: "contact de l'entreprise",
        contenu: "y",
      }),
    ).rejects.toThrow(/déjà utilisé/);
  });

  it("modifie partiellement et refuse les homonymes", async () => {
    const links = repo(row());
    const updated = await updateConnaissance({ connaissances: links }, ACTOR, "c1", {
      contenu: "nouveau@example.com",
      actif: false,
    });
    expect(updated.contenu).toBe("nouveau@example.com");
    expect(updated.actif).toBe(false);
    await expect(
      updateConnaissance({ connaissances: links }, ACTOR, "missing", { contenu: "x" }),
    ).rejects.toThrow(/introuvable/);
    const homonym: ConnaissanceRepository = {
      ...repo(row()),
      findByTitre: async () => row({ id: "autre", titre: "Tarifs" }),
    };
    await expect(
      updateConnaissance({ connaissances: homonym }, ACTOR, "c1", { titre: "Tarifs" }),
    ).rejects.toThrow(/déjà utilisé/);
  });

  it("supprime une entrée existante", async () => {
    const links = repo(row());
    await deleteConnaissance({ connaissances: links }, ACTOR, "c1");
    await expect(deleteConnaissance({ connaissances: repo(null) }, ACTOR, "c1")).rejects.toThrow(
      /introuvable/,
    );
  });
});
