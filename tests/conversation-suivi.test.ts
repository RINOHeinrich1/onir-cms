import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { startConversation } from "@/application/use-cases/chat/start-conversation";
import { countConversations } from "@/application/use-cases/conversations/list-conversations";
import { type ChatLink, type Conversation, parseConversationFilter } from "@/domain/entities/chat";
import type { Prospect } from "@/domain/entities/prospect";

const SOURCES = { connaissances: true, phototheque: true, lien: true };

function link(overrides: Partial<ChatLink> = {}): ChatLink {
  return {
    id: "l1",
    organizationId: "org-1",
    label: "Campagne",
    type: "standard",
    surface: "page",
    identificationMode: "contact",
    prospectId: null,
    createdBy: null,
    actif: true,
    expiresAt: null,
    templateKey: "fiche-projet",
    templateVersion: 1,
    sources: SOURCES,
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    widgetConfig: {},
    aiProviderId: null,
    aiModel: null,
    visitCount: 0,
    lastVisitAt: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function prospect(overrides: Partial<Prospect> = {}): Prospect {
  return {
    id: "p1",
    organizationId: "org-1",
    nom: "Jean",
    prenom: "",
    nature: "physique",
    email: "jean@exemple.mg",
    activite: "",
    fonction: "",
    detail: "",
    origine: "libre",
    lienId: "l1",
    lienLabel: null,
    contactMissing: false,
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function conversation(): Conversation {
  return {
    id: "c1",
    organizationId: "org-1",
    linkId: "l1",
    visitorNom: "Jean",
    visitorEmail: "jean@exemple.mg",
    visitorContacts: [],
    prospectId: "p1",
    statut: "en_cours",
    lastMessageAt: null,
    consentementAt: null,
    confidentialiteId: null,
    interventionMode: "ai",
    assignedUserId: null,
    assignedOperatorName: null,
    lastOperatorUserId: null,
    lastOperatorName: null,
    humanTakeoverAt: null,
    lastVisitorMessageAt: null,
    lastOperatorMessageAt: null,
    createdAt: new Date(0).toISOString(),
  };
}

function deps(options: {
  existingProspect?: Prospect | null;
  openConversation?: Conversation | null;
}) {
  const create = vi.fn(async () => conversation());
  const links = {
    findByTokenHash: async () => link(),
  } as unknown as ChatLinkRepository;
  const conversations = {
    findOpenByLinkAndProspect: async () => options.openConversation ?? null,
    create,
  } as unknown as ConversationRepository;
  const createProspect = vi.fn(async () => prospect());
  const prospects = {
    findByEmail: async () => options.existingProspect ?? null,
    create: createProspect,
  } as unknown as ProspectRepository;
  const organizations = {
    findById: async () => ({
      id: "org-1",
      name: "Onirtech",
      suspendedAt: null,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
  } as unknown as OrganizationRepository;
  return { deps: { organizations, links, conversations, prospects }, create, createProspect };
}

describe("parseConversationFilter", () => {
  it("défaut = en_cours ; accepte finalisees/toutes", () => {
    expect(parseConversationFilter(undefined)).toBe("en_cours");
    expect(parseConversationFilter("x")).toBe("en_cours");
    expect(parseConversationFilter("finalisees")).toBe("finalisees");
    expect(parseConversationFilter("toutes")).toBe("toutes");
    expect(parseConversationFilter("archivees")).toBe("archivees");
  });
});

describe("startConversation — identification et reprise", () => {
  it("crée le prospect (par email) et la conversation si aucun échange en cours", async () => {
    const base = deps({ existingProspect: null, openConversation: null });
    const result = await startConversation(base.deps, {
      token: "jeton",
      visitor: { nom: "Jean", email: "Jean@Exemple.mg" },
    });
    expect(base.createProspect).toHaveBeenCalledTimes(1);
    expect(base.createProspect).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({ email: "jean@exemple.mg", origine: "libre", lienId: "l1" }),
    );
    expect(base.create).toHaveBeenCalledTimes(1);
    expect(result.resumed).toBe(false);
  });

  it("réutilise un prospect existant (même email) au lieu d'en créer un", async () => {
    const base = deps({ existingProspect: prospect(), openConversation: null });
    await startConversation(base.deps, {
      token: "jeton",
      visitor: { nom: "Jean", email: "jean@exemple.mg" },
    });
    expect(base.createProspect).not.toHaveBeenCalled();
  });

  it("exige le consentement quand une politique est rattachée", async () => {
    const base = deps({ existingProspect: prospect(), openConversation: null });
    base.deps.links = {
      findByTokenHash: async () => link({ confidentialiteId: "conf-1" }),
    } as unknown as ChatLinkRepository;
    await expect(
      startConversation(base.deps, {
        token: "jeton",
        visitor: { nom: "Jean", email: "jean@exemple.mg" },
      }),
    ).rejects.toThrow(/confidentialit/i);
    expect(base.create).not.toHaveBeenCalled();
  });

  it("enregistre le consentement (date + politique) sur la conversation", async () => {
    const base = deps({ existingProspect: prospect(), openConversation: null });
    base.deps.links = {
      findByTokenHash: async () => link({ confidentialiteId: "conf-1" }),
    } as unknown as ChatLinkRepository;
    await startConversation(base.deps, {
      token: "jeton",
      visitor: { nom: "Jean", email: "jean@exemple.mg" },
      consentement: true,
    });
    expect(base.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        confidentialiteId: "conf-1",
        consentementAt: expect.any(String),
      }),
    );
  });

  it("reprend la conversation en cours du même lien et prospect", async () => {
    const base = deps({ existingProspect: prospect(), openConversation: conversation() });
    const result = await startConversation(base.deps, {
      token: "jeton",
      visitor: { nom: "Jean", email: "jean@exemple.mg" },
    });
    expect(result.resumed).toBe(true);
    expect(result.conversation.id).toBe("c1");
    expect(base.create).not.toHaveBeenCalled();
  });
});

const DASH_ACTOR: Actor = {
  id: "u1",
  role: "lecteur",
  organizationId: "org-1",
  isSuperAdmin: false,
};

describe("countConversations — vue globale", () => {
  it("compte les conversations actives de l'organisation active", async () => {
    const organizationIds: string[] = [];
    const conversations = {
      countByStatut: async (organizationId: string) => {
        organizationIds.push(organizationId);
        return { enCours: 3, finalisees: 2 };
      },
    } as unknown as ConversationRepository;

    await expect(countConversations({ conversations }, DASH_ACTOR)).resolves.toEqual({
      enCours: 3,
      finalisees: 2,
    });
    expect(organizationIds).toEqual(["org-1"]);
  });

  it("refuse un acteur sans organisation", async () => {
    const conversations = {} as ConversationRepository;
    await expect(
      countConversations({ conversations }, { ...DASH_ACTOR, organizationId: null }),
    ).rejects.toThrow(/autorisée/i);
  });
});

describe("startConversation — mode anonyme", () => {
  it("crée une conversation sans prospect et sans identité", async () => {
    const base = deps({});
    base.deps.links = {
      findByTokenHash: async () => link({ identificationMode: "anonymous" }),
    } as unknown as ChatLinkRepository;
    const result = await startConversation(base.deps, { token: "jeton" });
    expect(base.createProspect).not.toHaveBeenCalled();
    expect(base.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        visitorNom: "",
        visitorEmail: "",
        prospectId: null,
        confidentialiteId: null,
      }),
    );
    expect(result.prospect).toBeNull();
    expect(result.resumed).toBe(false);
  });

  it("exige le consentement quand une politique est rattachée", async () => {
    const base = deps({});
    base.deps.links = {
      findByTokenHash: async () =>
        link({ identificationMode: "anonymous", confidentialiteId: "conf-1" }),
    } as unknown as ChatLinkRepository;
    await expect(startConversation(base.deps, { token: "jeton" })).rejects.toThrow(
      /confidentialit/i,
    );
    expect(base.create).not.toHaveBeenCalled();
  });

  it("enregistre le consentement sans demander d'identité", async () => {
    const base = deps({});
    base.deps.links = {
      findByTokenHash: async () =>
        link({ identificationMode: "anonymous", confidentialiteId: "conf-1" }),
    } as unknown as ChatLinkRepository;
    await startConversation(base.deps, { token: "jeton", consentement: true });
    expect(base.create).toHaveBeenCalledWith(
      "org-1",
      expect.objectContaining({
        visitorEmail: "",
        confidentialiteId: "conf-1",
        consentementAt: expect.any(String),
      }),
    );
  });
});
