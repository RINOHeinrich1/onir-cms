import { describe, expect, it, vi } from "vitest";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import { listFiches, setFicheArchivee } from "@/application/use-cases/fiche/manage-fiches";
import {
  type Fiche,
  type FicheArchiveFilter,
  parseFicheArchiveFilter,
} from "@/domain/entities/fiche";

const ADMIN = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;
const LECTEUR = {
  id: "lect-1",
  role: "lecteur",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

function fiche(overrides: Partial<Fiche> = {}): Fiche {
  return {
    id: "f1",
    organizationId: "org-1",
    conversationId: null,
    prospectId: null,
    createdBy: null,
    templateKey: "fiche-projet",
    templateVersion: 1,
    data: {},
    plateformes: [],
    description: "",
    budget: "",
    duree: "",
    contact: "",
    statut: null,
    contraintesTechno: "",
    lienDocSpec: "",
    archivee: false,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function repo(current: Fiche | null) {
  const list = vi.fn(async (_filter: FicheArchiveFilter): Promise<Fiche[]> => []);
  const setArchivee = vi.fn(
    async (_organizationId: string, _id: string, archivee: boolean): Promise<Fiche | null> =>
      current === null ? null : { ...current, archivee },
  );
  return { list, setArchivee } as unknown as FicheRepository & {
    list: typeof list;
    setArchivee: typeof setArchivee;
  };
}

describe("parseFicheArchiveFilter", () => {
  it("défaut = actives ; accepte archivees/toutes", () => {
    expect(parseFicheArchiveFilter(undefined)).toBe("actives");
    expect(parseFicheArchiveFilter("")).toBe("actives");
    expect(parseFicheArchiveFilter("n_importe_quoi")).toBe("actives");
    expect(parseFicheArchiveFilter("archivees")).toBe("archivees");
    expect(parseFicheArchiveFilter("toutes")).toBe("toutes");
  });
});

describe("listFiches — filtre serveur", () => {
  it("par défaut, exclut les fiches archivées", async () => {
    const fiches = repo(null);
    await listFiches({ fiches }, ADMIN);
    expect(fiches.list).toHaveBeenCalledWith("org-1", "actives", null);
  });

  it("transmet le filtre demandé", async () => {
    const fiches = repo(null);
    await listFiches({ fiches }, ADMIN, "archivees");
    expect(fiches.list).toHaveBeenCalledWith("org-1", "archivees", null);
  });

  it("transmet le libellé de lien de chat", async () => {
    const fiches = repo(null);
    await listFiches({ fiches }, ADMIN, "actives", "Campagne été");
    expect(fiches.list).toHaveBeenCalledWith("org-1", "actives", "Campagne été");
  });
});

describe("setFicheArchivee", () => {
  it("archive une fiche (admin)", async () => {
    const fiches = repo(fiche());
    const result = await setFicheArchivee({ fiches }, ADMIN, "f1", true);
    expect(result.archivee).toBe(true);
    expect(fiches.setArchivee).toHaveBeenCalledWith("org-1", "f1", true);
  });

  it("refuse un lecteur (RBAC project:write)", async () => {
    const fiches = repo(fiche());
    await expect(setFicheArchivee({ fiches }, LECTEUR, "f1", true)).rejects.toThrow(/non autoris/i);
  });

  it("404 si fiche introuvable", async () => {
    const fiches = repo(null);
    await expect(setFicheArchivee({ fiches }, ADMIN, "absent", true)).rejects.toThrow(
      /introuvable/i,
    );
  });
});
