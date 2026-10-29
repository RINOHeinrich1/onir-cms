import { describe, expect, it } from "vitest";
import type { Actor } from "@/application/actor";
import type {
  FicheCollecteRepository,
  FicheCollecteVersion,
} from "@/application/ports/fiche-collecte-repository";
import {
  createFicheCollecte,
  listFicheCollecteVersions,
  updateFicheCollecte,
} from "@/application/use-cases/fiches-collecte/manage-fiche-collectes";
import { parseChatbotConfig } from "@/domain/entities/chatbot-config";
import {
  type FicheCollecte,
  type FicheCollecteInput,
  ficheToDefinitionSnapshot,
  validateFicheCollecte,
} from "@/domain/entities/fiche-collecte";

const ACTOR: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

function input(overrides: Partial<FicheCollecteInput> = {}): FicheCollecteInput {
  return {
    key: "hotel",
    label: "Demande d'hôtel",
    description: "Hébergement",
    intent: "Le visiteur cherche un hôtel",
    fields: [
      { name: "ville", label: "Ville", type: "text", required: true },
      { name: "contact", label: "Contact", type: "email", required: true },
    ],
    renderTemplate: "# Hôtel\n\nVille : {{ville}}\n\nContact : {{contact}}\n",
    instructions: "",
    ...overrides,
  };
}

function memoryRepository(): FicheCollecteRepository {
  const items: FicheCollecte[] = [];
  const versions = new Map<string, FicheCollecteVersion[]>();
  return {
    async list() {
      return [...items];
    },
    async findById(_org, id) {
      return items.find((entry) => entry.id === id) ?? null;
    },
    async findByKey(_org, key) {
      return items.find((entry) => entry.key === key) ?? null;
    },
    async create(_org, value, createdBy) {
      const now = new Date().toISOString();
      const fiche: FicheCollecte = {
        id: `fiche-${items.length + 1}`,
        organizationId: "org-1",
        ...value,
        version: 1,
        createdBy,
        createdAt: now,
        updatedAt: now,
      };
      items.push(fiche);
      versions.set(fiche.id, [
        { ...value, id: "v1", ficheCollecteId: fiche.id, version: 1, createdBy, createdAt: now },
      ]);
      return fiche;
    },
    async updateVersion(_org, id, value, createdBy) {
      const current = items.find((entry) => entry.id === id);
      if (current === undefined) return null;
      const version = current.version + 1;
      Object.assign(current, value, { version, updatedAt: new Date().toISOString() });
      const history = versions.get(id) ?? [];
      history.push({
        ...value,
        id: `v${version}`,
        ficheCollecteId: id,
        version,
        createdBy,
        createdAt: new Date().toISOString(),
      });
      versions.set(id, history);
      return current;
    },
    async listVersions(_org, id) {
      return versions.get(id) ?? [];
    },
    async findVersion(_org, id, version) {
      return (versions.get(id) ?? []).find((entry) => entry.version === version) ?? null;
    },
    async delete(_org, id) {
      const index = items.findIndex((entry) => entry.id === id);
      if (index === -1) return false;
      items.splice(index, 1);
      versions.delete(id);
      return true;
    },
  };
}

describe("fiches de collecte réutilisables", () => {
  it("valide une fiche et refuse une clé invalide", () => {
    expect(validateFicheCollecte(input()).ok).toBe(true);
    const invalid = validateFicheCollecte(input({ key: "Hôtel !" }));
    expect(invalid.ok).toBe(false);
  });

  it("crée une fiche version 1 puis une nouvelle version immuable à l'édition", async () => {
    const deps = { fiches: memoryRepository() };
    const created = await createFicheCollecte(deps, ACTOR, input());
    expect(created.version).toBe(1);

    const updated = await updateFicheCollecte(deps, ACTOR, created.id, {
      label: "Demande d'hébergement",
    });
    expect(updated.version).toBe(2);
    expect(updated.label).toBe("Demande d'hébergement");

    const history = await listFicheCollecteVersions(deps, ACTOR, created.id);
    expect(history.map((entry) => entry.version)).toEqual([1, 2]);
    expect(history[0]?.label).toBe("Demande d'hôtel");
    expect(history[1]?.label).toBe("Demande d'hébergement");
  });

  it("génère une clé unique quand le libellé produit une clé déjà utilisée", async () => {
    const deps = { fiches: memoryRepository() };
    await createFicheCollecte(deps, ACTOR, input());
    const second = await createFicheCollecte(deps, ACTOR, input());
    expect(second.key).toBe("hotel-2");
  });

  it("génère la clé depuis le libellé quand elle n'est pas fournie", async () => {
    const deps = { fiches: memoryRepository() };
    const created = await createFicheCollecte(deps, ACTOR, input({ key: "" }));
    expect(created.key).toBe("demande-d-hotel");
  });

  it("produit un snapshot de fiche avec sourceFicheId/sourceVersion pour le chatbot", async () => {
    const deps = { fiches: memoryRepository() };
    const created = await createFicheCollecte(deps, ACTOR, input());
    const snapshot = ficheToDefinitionSnapshot(created);
    expect(snapshot).toMatchObject({
      key: "hotel",
      sourceFicheId: created.id,
      sourceVersion: 1,
    });
    expect(snapshot.fields).toEqual(created.fields);
  });

  it("conserve le snapshot dans la configuration du chatbot (copie indépendante)", () => {
    const parsed = parseChatbotConfig({
      systemPrompt: "Tu collectes les demandes.",
      simple: {},
      fiches: [
        {
          ...input(),
          sourceFicheId: "fiche-1",
          sourceVersion: 2,
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.fiches[0]).toMatchObject({
      key: "hotel",
      sourceFicheId: "fiche-1",
      sourceVersion: 2,
    });
  });

  it("n'affecte pas le snapshot du chatbot quand la fiche réutilisable évolue", async () => {
    const deps = { fiches: memoryRepository() };
    const created = await createFicheCollecte(deps, ACTOR, input());
    const snapshot = ficheToDefinitionSnapshot(created);
    await updateFicheCollecte(deps, ACTOR, created.id, {
      label: "Nouvelle version",
      fields: [{ name: "ville", label: "Ville", type: "text", required: false }],
    });
    expect(snapshot.label).toBe("Demande d'hôtel");
    expect(snapshot.fields).toHaveLength(2);
    expect(snapshot.sourceVersion).toBe(1);
  });
});
