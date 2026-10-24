import { describe, expect, it } from "vitest";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { getProspect360 } from "@/application/use-cases/prospects/get-prospect-360";
import type { ChatLink, Conversation } from "@/domain/entities/chat";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";

const ACTOR = {
  id: "u1",
  role: "marketeur",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

const PROSPECT: Prospect = {
  id: "p1",
  organizationId: "org-1",
  nom: "Rakoto",
  prenom: "Jean",
  nature: "physique",
  email: "jean@exemple.mg",
  activite: "Commerce",
  fonction: "Gérant",
  detail: "téléphone : +261340000000",
  origine: "saisie",
  lienId: null,
  lienLabel: null,
  createdBy: null,
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function conversation(id: string, contacts: { type: string; valeur: string }[]): Conversation {
  return {
    id,
    organizationId: "org-1",
    linkId: "l1",
    visitorNom: "Jean Rakoto",
    visitorEmail: "jean@exemple.mg",
    visitorContacts: contacts,
    prospectId: null,
    statut: "en_cours",
    lastMessageAt: null,
    consentementAt: null,
    confidentialiteId: null,
    createdAt: new Date(0).toISOString(),
  };
}

function deps() {
  const prospects: ProspectRepository = {
    findById: async (_organizationId, id) => (id === "p1" ? PROSPECT : null),
    findByEmail: async () => PROSPECT,
    list: async () => [PROSPECT],
    listLinkLabels: async () => [],
    create: async () => PROSPECT,
    update: async () => PROSPECT,
    delete: async () => true,
  };
  const fiches: FicheRepository = {
    findById: async () => null,
    listByConversation: async () => [],
    setArchivee: async () => null,
    create: async () => ({}) as Fiche,
    list: async () => [
      {
        id: "f1",
        conversationId: "c-from-fiche",
        prospectId: "p1",
        createdBy: null,
        plateformes: ["site web"],
        description: "d",
        budget: "1",
        duree: "2",
        contact: "x",
        statut: "initier",
        contraintesTechno: "",
        lienDocSpec: "",
        createdAt: new Date(0).toISOString(),
      } as Fiche,
      {
        id: "f2",
        conversationId: null,
        prospectId: "autre",
        createdBy: null,
        plateformes: ["mobile"],
        description: "d",
        budget: "1",
        duree: "2",
        contact: "x",
        statut: "initier",
        contraintesTechno: "",
        lienDocSpec: "",
        createdAt: new Date(0).toISOString(),
      } as Fiche,
    ],
  };
  const links: ChatLinkRepository = {
    findById: async () => null,
    findByTokenHash: async () => null,
    list: async () =>
      [
        { id: "l1", type: "specifique", prospectId: "p1" },
        { id: "l2", type: "specifique", prospectId: "autre" },
      ] as ChatLink[],
    create: async () => ({}) as ChatLink,
    recordVisit: async () => undefined,
    getTokenEnc: async () => null,
    setLinkToken: async () => null,
    updateDetails: async () => null,
    delete: async () => true,
  };
  const conversations: ConversationRepository = {
    findById: async (_organizationId, id) =>
      id === "c-from-fiche"
        ? conversation("c-from-fiche", [{ type: "whatsapp", valeur: "wa-1" }])
        : null,
    findByIdPublic: async (id) => (id === "c-from-fiche" ? conversation("c-from-fiche", []) : null),
    create: async () => conversation("c1", []),
    appendMessage: async () => {
      throw new Error("non utilisé");
    },
    findMessage: async () => null,
    setMessageMedias: async () => null,
    findOpenByLinkAndProspect: async () => null,
    listWithDetails: async () => [],
    countByStatut: async () => ({ enCours: 0, finalisees: 0 }),
    markFinalisee: async () => undefined,
    setArchivee: async () => true,
    listMessages: async () => [],
    listByLink: async (_organizationId, linkId) =>
      linkId === "l1"
        ? [conversation("c-link", [{ type: "téléphone", valeur: "+261340000001" }])]
        : [],
  };
  return { prospects, fiches, links, conversations };
}

describe("getProspect360", () => {
  it("consolide identité, contacts, conversations et fiches du prospect", async () => {
    const result = await getProspect360(deps(), ACTOR, "p1");
    expect(result.prospect.id).toBe("p1");
    expect(result.fiches.map((fiche) => fiche.id)).toEqual(["f1"]);
    expect(result.conversations.map((c) => c.id).sort()).toEqual(["c-from-fiche", "c-link"]);
    expect(result.contacts).toEqual([
      { type: "email", valeur: "jean@exemple.mg", source: "prospect" },
      { type: "téléphone", valeur: "+261340000001", source: "conversation" },
      { type: "whatsapp", valeur: "wa-1", source: "conversation" },
    ]);
  });

  it("déduplique les contacts identiques", async () => {
    const base = deps();
    const withDuplicate: ConversationRepository = {
      ...base.conversations,
      findById: async () => null,
      listByLink: async (_organizationId, _linkId) => [
        conversation("c-link", [{ type: "email", valeur: "JEAN@exemple.mg" }]),
      ],
    };
    const result = await getProspect360({ ...base, conversations: withDuplicate }, ACTOR, "p1");
    expect(result.contacts).toHaveLength(1);
  });

  it("échoue sur prospect introuvable", async () => {
    await expect(getProspect360(deps(), ACTOR, "inconnu")).rejects.toThrow(/introuvable/);
  });
});
