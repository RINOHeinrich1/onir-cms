import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  ChatbotDraft,
  ChatbotDraftRepository,
} from "@/application/ports/chatbot-draft-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { MediaStorage } from "@/application/ports/media-storage";
import {
  createChatbotDraft,
  deleteChatbotDraft,
  listChatbotDrafts,
  updateChatbotDraft,
} from "@/application/use-cases/chatbot-drafts/manage-chatbot-drafts";
import type { ChatbotDataDraft } from "@/components/links/chatbot-data-draft";
import { submitChatbotDataDraft } from "@/components/links/chatbot-data-draft";
import type { Media } from "@/domain/entities/media";

const ACTOR = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

const READER = { ...ACTOR, id: "user-2", role: "lecteur" } as const;

function memoryDrafts(): ChatbotDraftRepository & { store: Map<string, ChatbotDraft> } {
  const store = new Map<string, ChatbotDraft>();
  let sequence = 0;
  const repo: ChatbotDraftRepository & { store: Map<string, ChatbotDraft> } = {
    store,
    async list(organizationId) {
      return [...store.values()].filter((entry) => entry.organizationId === organizationId);
    },
    async findById(organizationId, id) {
      const found = store.get(id);
      return found !== undefined && found.organizationId === organizationId ? found : null;
    },
    async create(organizationId, input) {
      sequence += 1;
      const draft: ChatbotDraft = {
        id: `draft-${sequence}`,
        organizationId,
        createdBy: input.createdBy,
        label: input.label,
        state: input.state,
        createdAt: new Date(sequence * 1000).toISOString(),
        updatedAt: new Date(sequence * 1000).toISOString(),
      };
      store.set(draft.id, draft);
      return draft;
    },
    async update(organizationId, id, input) {
      const found = store.get(id);
      if (found === undefined || found.organizationId !== organizationId) return null;
      const updated: ChatbotDraft = {
        ...found,
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.state === undefined ? {} : { state: input.state }),
        updatedAt: new Date().toISOString(),
      };
      store.set(id, updated);
      return updated;
    },
    async delete(organizationId, id) {
      const found = store.get(id);
      if (found === undefined || found.organizationId !== organizationId) return false;
      return store.delete(id);
    },
  };
  return repo;
}

function media({ id, ...overrides }: Partial<Media> & Pick<Media, "id">): Media {
  return {
    id,
    organizationId: "org-1",
    type: "photo",
    libelle: `Média ${id}`,
    description: "",
    chatLinkIds: [],
    actif: false,
    fichier: `files/${id}.png`,
    mime: "image/png",
    url: null,
    createdBy: "user-1",
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function memoryMedias(initial: Media[]): {
  repo: MediaRepository;
  removed: string[];
  store: Map<string, Media>;
} {
  const store = new Map(initial.map((entry) => [entry.id, entry]));
  const removed: string[] = [];
  const repo: MediaRepository = {
    async findById(organizationId, id) {
      const found = store.get(id);
      return found !== undefined && found.organizationId === organizationId ? found : null;
    },
    async findByIdPublic(id) {
      return store.get(id) ?? null;
    },
    async findByLibelle() {
      return null;
    },
    async list(organizationId) {
      return [...store.values()].filter((entry) => entry.organizationId === organizationId);
    },
    async listActivesByType() {
      return [];
    },
    async create() {
      throw new Error("non utilisé");
    },
    async update() {
      return null;
    },
    async delete(organizationId, id) {
      const found = store.get(id);
      if (found === undefined || found.organizationId !== organizationId) return false;
      store.delete(id);
      removed.push(id);
      return true;
    },
  };
  return { repo, removed, store };
}

const storage: MediaStorage = {
  async save() {
    return "files/new.png";
  },
  async read() {
    return null;
  },
  async remove(key) {
    removedFiles.push(key);
  },
};

const removedFiles: string[] = [];

describe("gestion des brouillons de chatbot", () => {
  it("crée, liste, met à jour et isole par organisation", async () => {
    const drafts = memoryDrafts();
    const created = await createChatbotDraft({ drafts }, ACTOR, {
      label: "  Campagne  ",
      state: { step: 2, label: "Campagne" },
    });
    expect(created).toMatchObject({
      organizationId: "org-1",
      createdBy: "user-1",
      label: "Campagne",
    });
    // Un brouillon n'est jamais un chatbot public : ni jeton, ni URL.
    expect(created).not.toHaveProperty("token");
    expect(created).not.toHaveProperty("url");
    expect((await listChatbotDrafts({ drafts }, ACTOR)).map((entry) => entry.id)).toEqual([
      created.id,
    ]);

    const updated = await updateChatbotDraft({ drafts }, ACTOR, created.id, {
      label: "Campagne v2",
      state: { step: 3 },
    });
    expect(updated.label).toBe("Campagne v2");
    expect(updated.state).toEqual({ step: 3 });

    await expect(updateChatbotDraft({ drafts }, ACTOR, created.id, {})).rejects.toThrow(
      /Aucun champ/,
    );
    await expect(updateChatbotDraft({ drafts }, ACTOR, "inconnu", { label: "x" })).rejects.toThrow(
      /introuvable/,
    );

    await expect(createChatbotDraft({ drafts }, READER, { state: { step: 1 } })).rejects.toThrow(
      /non autorisée/,
    );
  });

  it("supprime le brouillon et uniquement ses photos temporaires", async () => {
    const drafts = memoryDrafts();
    const created = await createChatbotDraft({ drafts }, ACTOR, {
      state: {
        dataDraft: {
          photos: [
            { id: "p1", mediaId: "temp" },
            { id: "p2", mediaId: "already-active" },
            { id: "p3", mediaId: "already-scoped" },
          ],
        },
      },
    });
    const medias = memoryMedias([
      media({ id: "temp", actif: false, chatLinkIds: [] }),
      media({ id: "already-active", actif: true, chatLinkIds: [] }),
      media({ id: "already-scoped", actif: false, chatLinkIds: ["link-1"] }),
    ]);
    removedFiles.length = 0;

    await deleteChatbotDraft({ drafts, medias: medias.repo, storage }, ACTOR, created.id);

    expect(await drafts.findById("org-1", created.id)).toBeNull();
    // Après finalisation, la liste ne contient plus de brouillon (pas de doublon).
    expect(await listChatbotDrafts({ drafts }, ACTOR)).toEqual([]);
    expect(medias.removed).toEqual(["temp"]);
    expect(removedFiles).toEqual(["files/temp.png"]);
    expect(medias.store.has("already-active")).toBe(true);
    expect(medias.store.has("already-scoped")).toBe(true);
  });

  it("conserve une photo dont la finalisation a échoué", async () => {
    const drafts = memoryDrafts();
    const created = await createChatbotDraft({ drafts }, ACTOR, {
      state: { dataDraft: { photos: [{ id: "p1", mediaId: "temp" }] } },
    });
    const medias = memoryMedias([media({ id: "temp", actif: false, chatLinkIds: [] })]);
    removedFiles.length = 0;

    await deleteChatbotDraft({ drafts, medias: medias.repo, storage }, ACTOR, created.id, {
      keepMediaIds: ["temp"],
    });

    expect(await drafts.findById("org-1", created.id)).toBeNull();
    expect(medias.store.has("temp")).toBe(true);
    expect(medias.removed).toEqual([]);
    expect(removedFiles).toEqual([]);
  });

  it("refuse la suppression d'un brouillon inconnu", async () => {
    const drafts = memoryDrafts();
    await expect(deleteChatbotDraft({ drafts }, ACTOR, "inconnu")).rejects.toThrow(/introuvable/);
  });
});

describe("finalisation des données du brouillon", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function draft(): ChatbotDataDraft {
    return {
      connaissances: [{ id: "c1", titre: "Titre", contenu: "Contenu" }],
      liens: [
        { id: "l1", libelle: "Lien", url: "https://example.com", description: "Description" },
      ],
      photos: [{ id: "p1", libelle: "Photo", description: "Desc", mediaId: "media-1" }],
    };
  }

  it("rattache connaissances, liens et finalise la photo temporaire", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
        calls.push({ url: String(url), init: init ?? {} });
        return new Response(null, { status: 200 });
      }),
    );

    const result = await submitChatbotDataDraft(draft(), "link-1");

    expect(result).toEqual({ created: 3, failures: [], failedPhotoMediaIds: [] });
    const connaissance = calls.find((call) => call.url === "/api/connaissances");
    expect(connaissance).toBeDefined();
    expect(JSON.parse(String(connaissance?.init.body))).toMatchObject({
      titre: "Titre",
      contenu: "Contenu",
      chatLinkIds: ["link-1"],
      actif: true,
    });

    const lien = calls.find((call) => call.url === "/api/medias" && call.init.method === "POST");
    expect(lien).toBeDefined();
    expect(JSON.parse(String(lien?.init.body))).toMatchObject({
      libelle: "Lien",
      url: "https://example.com",
      chatLinkIds: ["link-1"],
      actif: true,
    });

    const photo = calls.find((call) => call.url === "/api/medias/media-1");
    expect(photo?.init.method).toBe("PATCH");
    expect(JSON.parse(String(photo?.init.body))).toEqual({
      chatLinkIds: ["link-1"],
      actif: true,
    });
  });

  it("signale explicitement l'échec de finalisation d'une photo (après retry)", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ error: "indisponible" }), { status: 500 });
      }),
    );

    const result = await submitChatbotDataDraft(
      {
        connaissances: [],
        liens: [],
        photos: [{ id: "p1", libelle: "Photo", description: "", mediaId: "media-1" }],
      },
      "link-1",
    );

    expect(result.created).toBe(0);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toMatch(/Photo/);
    expect(result.failedPhotoMediaIds).toEqual(["media-1"]);
    expect(calls.filter((url) => url === "/api/medias/media-1")).toHaveLength(2);
  });
});
