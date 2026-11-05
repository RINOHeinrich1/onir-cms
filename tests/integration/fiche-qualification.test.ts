import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setFicheQualificationStatus } from "@/application/use-cases/fiche/manage-fiche-status";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { FicheStatusDefinition } from "@/domain/entities/fiche-status";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { makeOrganization, makeUser, setupDb } from "./helpers/db";

let pool: Pool;
let orgA: string;
let orgB: string;
let userId: string;

const STATUSES: FicheStatusDefinition[] = [
  {
    key: "a_qualifier",
    label: "À qualifier",
    order: 0,
    isDefault: true,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
  {
    key: "qualifie",
    label: "Qualifié",
    order: 1,
    isDefault: false,
    archivedAt: null,
    updatedAt: "2026-11-04T12:00:00.000Z",
  },
  {
    key: "ancien",
    label: "Ancien",
    order: 2,
    isDefault: false,
    archivedAt: "2026-11-03T00:00:00.000Z",
    updatedAt: "2026-11-03T00:00:00.000Z",
  },
];

const DEFINITION: TemplateDefinition = {
  key: "maison",
  label: "Maison",
  description: "",
  systemPrompt: "x",
  fields: [{ name: "ville", label: "Ville", type: "text", required: true }],
  statuses: STATUSES,
  renderTemplate: "# {{ville}}",
};

const ACTOR = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "admin" as const,
  organizationId: "",
  isSuperAdmin: false,
};

beforeAll(async () => {
  pool = await setupDb();
  orgA = await makeOrganization(pool, "Org qualification A");
  orgB = await makeOrganization(pool, "Org qualification B");
  userId = await makeUser(pool, "qualification@example.mg");
});

beforeEach(async () => {
  await pool.query("DELETE FROM fiches");
});

afterAll(async () => {
  await pool?.end();
});

function actorFor(organizationId: string) {
  return { ...ACTOR, id: userId, organizationId };
}

async function createFiche(organizationId: string) {
  return pgFicheRepository(pool).create(organizationId, {
    conversationId: null,
    prospectId: null,
    createdBy: null,
    definition: DEFINITION,
    data: { ville: "Antananarivo" },
    qualificationStatusKey: "a_qualifier",
  });
}

describe("fiche qualification — persistance et isolation", () => {
  it("crée une fiche avec le statut par défaut et le résout", async () => {
    const fiche = await createFiche(orgA);
    expect(fiche.qualificationStatusKey).toBe("a_qualifier");
    expect(fiche.qualificationStatusUpdatedAt).not.toBeNull();
    expect(await pgFicheRepository(pool).findById(orgA, fiche.id)).not.toBeNull();
    expect(await pgFicheRepository(pool).findById(orgB, fiche.id)).toBeNull();
  });

  it("change le statut, filtre par statut et refuse une clé archivée ou inconnue", async () => {
    const repo = pgFicheRepository(pool);
    const fiche = await createFiche(orgA);
    const changed = await setFicheQualificationStatus(
      { fiches: repo },
      actorFor(orgA),
      fiche.id,
      "qualifie",
    );
    expect(changed.qualificationStatusKey).toBe("qualifie");
    expect((await repo.list(orgA, "actives", null, ["qualifie"])).map((entry) => entry.id)).toEqual(
      [fiche.id],
    );
    expect(await repo.list(orgA, "actives", null, ["a_qualifier"])).toEqual([]);

    await expect(
      setFicheQualificationStatus({ fiches: repo }, actorFor(orgA), fiche.id, "ancien"),
    ).rejects.toThrow(/archivé/);
    await expect(
      setFicheQualificationStatus({ fiches: repo }, actorFor(orgA), fiche.id, "inconnu"),
    ).rejects.toThrow(/inconnu/);
    await expect(
      setFicheQualificationStatus({ fiches: repo }, actorFor(orgB), fiche.id, "qualifie"),
    ).rejects.toThrow(/introuvable/);
  });

  it("efface le statut avec null", async () => {
    const repo = pgFicheRepository(pool);
    const fiche = await createFiche(orgA);
    const cleared = await setFicheQualificationStatus(
      { fiches: repo },
      actorFor(orgA),
      fiche.id,
      null,
    );
    expect(cleared.qualificationStatusKey).toBeNull();
    expect(cleared.qualificationStatusUpdatedAt).toBeNull();
  });
});
