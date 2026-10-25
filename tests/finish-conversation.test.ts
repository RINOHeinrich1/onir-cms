import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { finishConversation } from "@/application/use-cases/chat/finish-conversation";
import type { TemplateDefinition } from "@/domain/entities/chat-template";

const DEFINITION: TemplateDefinition = {
  key: "demo",
  label: "Démo",
  description: "",
  systemPrompt: "x",
  fields: [
    { name: "sujet", label: "Sujet", type: "text", required: true },
    { name: "contact", label: "Contact", type: "text", required: true },
  ],
  renderTemplate: "# Demande\n\nSujet : {{sujet}}\n\nContact : {{contact}}\n",
};

const LINK = {
  id: "link-1",
  organizationId: "org-1",
  label: "",
  type: "standard",
  identificationMode: "contact",
  prospectId: null,
  createdBy: null,
  actif: true,
  expiresAt: null,
  templateKey: "demo",
  templateVersion: 1,
  sources: { connaissances: true, phototheque: true, lien: true },
  confidentialiteId: null,
  userStateEnabled: false,
  visualTemplateId: null,
  visualTemplateVersion: null,
  visualTemplateConfig: {},
  visualTemplateParams: {},
  aiProviderId: null,
  aiModel: null,
  visitCount: 0,
  lastVisitAt: null,
  createdAt: new Date(0).toISOString(),
} as const;

const CONVERSATION = {
  id: "conv-1",
  organizationId: "org-1",
  linkId: "link-1",
  visitorNom: "Jean Rakoto",
  visitorEmail: "jean@exemple.mg",
  visitorContacts: [{ type: "téléphone", valeur: "+261340000000" }],
  prospectId: null,
  statut: "en_cours" as const,
  lastMessageAt: null,
  consentementAt: null,
  confidentialiteId: null,
  createdAt: new Date(0).toISOString(),
};

function deps(aiAnswer: string) {
  const ai: AiClient = { complete: async () => aiAnswer };
  const conversations: ConversationRepository = {
    findById: async () => ({ ...CONVERSATION }),
    findByIdPublic: async () => ({ ...CONVERSATION }),
    create: async () => ({ ...CONVERSATION }),
    appendMessage: async (_organizationId, _id, role, content) => ({
      id: "msg",
      conversationId: "conv-1",
      role,
      content,
      medias: [],
      mediasComputed: false,
      attachments: [],
      createdAt: new Date(0).toISOString(),
    }),
    findMessage: async () => null,
    setMessageMedias: async () => null,
    findOpenByLinkAndProspect: async () => null,
    listWithDetails: async () => [],
    countByStatut: async () => ({ enCours: 0, finalisees: 0 }),
    markFinalisee: async () => undefined,
    setArchivee: async () => true,
    listMessages: async () => [
      {
        id: "m1",
        conversationId: "conv-1",
        role: "user" as const,
        content: "Bonjour",
        medias: [],
        mediasComputed: false,
        attachments: [],
        createdAt: new Date(0).toISOString(),
      },
    ],
    listByLink: async () => [],
  };
  const links: ChatLinkRepository = {
    findById: async () => ({ ...LINK, type: "standard" as const }),
    findByTokenHash: async () => null,
    list: async () => [],
    create: async () => ({ ...LINK, type: "standard" as const }),
    recordVisit: async () => undefined,
    getTokenEnc: async () => null,
    setLinkToken: async () => null,
    updateDetails: async () => null,
    delete: async () => false,
  };
  const templates: ChatTemplateRepository = {
    findByKey: async () => null,
    findVersion: async () => ({
      id: "v1",
      templateId: "t1",
      version: 1,
      definition: DEFINITION,
      createdBy: null,
      createdAt: new Date(0).toISOString(),
    }),
    currentVersion: async () => null,
    createTemplate: async () => {
      throw new Error("non utilisé");
    },
    addVersion: async () => {
      throw new Error("non utilisé");
    },
    deleteTemplate: async () => false,
    list: async () => [],
    listKeysReferencedByLinks: async () => [],
    listKeysReferencedByFiches: async () => [],
  };
  const createdProspects: Array<{
    nom: string;
    email: string;
    detail: string;
    origine: string | undefined;
    lienId: string | null | undefined;
  }> = [];
  const prospects: ProspectRepository = {
    findById: async () => null,
    findByEmail: async () => null,
    list: async () => [],
    listLinkLabels: async () => [],
    create: async (organizationId, input) => {
      createdProspects.push({
        nom: input.nom,
        email: input.email,
        detail: input.detail,
        origine: input.origine,
        lienId: input.lienId,
      });
      return {
        id: "prospect-auto",
        organizationId,
        nom: input.nom,
        prenom: input.prenom,
        nature: input.nature,
        email: input.email,
        activite: input.activite,
        fonction: input.fonction,
        detail: input.detail,
        origine: input.origine ?? "saisie",
        lienId: input.lienId ?? null,
        lienLabel: null,
        createdBy: input.createdBy,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
    },
    update: async () => null,
    delete: async () => false,
  };
  const fiches: FicheRepository = {
    findById: async () => null,
    listByConversation: async () => [],
    setArchivee: async () => null,
    list: async () => [],
    create: vi.fn(async (organizationId, input) => ({
      id: "fiche-1",
      organizationId,
      conversationId: input.conversationId,
      prospectId: input.prospectId,
      createdBy: input.createdBy,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      data: input.data,
      plateformes: [],
      description: "",
      budget: "",
      duree: "",
      contact: "",
      statut: null,
      contraintesTechno: "",
      lienDocSpec: "",
      archivee: false,
      createdAt: new Date("2026-01-02T00:00:00.000Z").toISOString(),
    })),
  };
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
  return {
    organizations,
    links,
    conversations,
    prospects,
    fiches,
    templates,
    attachments: {
      listByConversation: async () => [],
      attachToFiche: async () => undefined,
    } as unknown as AttachmentRepository,
    ai: fixedAiClientFactory(ai),
    createdProspects,
  };
}

describe("finishConversation — bouton Terminer (moteur)", () => {
  it("crée la fiche via le modèle : data + markdown moteur", async () => {
    const base = deps(JSON.stringify({ sujet: "Refonte du site" }));
    const finished = await finishConversation(base, "conv-1");
    expect(finished.fiche.templateKey).toBe("demo");
    expect(finished.fiche.templateVersion).toBe(1);
    expect(finished.fiche.data).toMatchObject({ sujet: "Refonte du site" });
    expect(finished.fiche.prospectId).toBe("prospect-auto");
    expect(base.createdProspects).toEqual([
      {
        nom: "Jean Rakoto",
        email: "jean@exemple.mg",
        detail: "téléphone : +261340000000",
        origine: "libre",
        lienId: "link-1",
      },
    ]);
    expect(finished.markdown).toBe(
      "# Demande\n\nSujet : Refonte du site\n\nContact : Jean Rakoto — jean@exemple.mg — téléphone : +261340000000\n",
    );
  });

  it("renvoie 422 logique quand il manque des champs", async () => {
    await expect(finishConversation(deps(JSON.stringify({})), "conv-1")).rejects.toThrow(
      /obligatoire/,
    );
  });

  it("échoue sur conversation introuvable", async () => {
    const base = deps("{}");
    const emptyConvs: ConversationRepository = {
      ...base.conversations,
      findById: async () => null,
    };
    await expect(
      finishConversation({ ...base, conversations: emptyConvs }, "missing"),
    ).rejects.toThrow(/introuvable/);
  });

  it("échoue sur modèle introuvable", async () => {
    const base = deps("{}");
    const noTemplate: ChatTemplateRepository = {
      ...base.templates,
      findVersion: async () => null,
    };
    await expect(finishConversation({ ...base, templates: noTemplate }, "conv-1")).rejects.toThrow(
      /Modèle/,
    );
  });

  it("refuse une fiche pour une conversation anonyme", async () => {
    const base = deps("{}");
    const links = {
      ...base.links,
      findById: async () => ({ ...LINK, identificationMode: "anonymous" as const }),
    };
    await expect(finishConversation({ ...base, links }, "conv-1")).rejects.toThrow(/anonyme/i);
  });
});

describe("finishConversation — pièces jointes (ADR-0034)", () => {
  it("référence les pièces dans la fiche sans les envoyer à l'IA", async () => {
    const fileDefinition: TemplateDefinition = {
      key: "demo",
      label: "Démo",
      description: "",
      systemPrompt: "x",
      fields: [
        {
          name: "cin",
          label: "CIN",
          type: "file",
          required: true,
          file: { accept: ["image/png"], maxFiles: 1, maxBytes: 1024 },
        },
      ],
      renderTemplate: "# CIN\n\n{{cin}}\n",
    };
    const base = deps("{}");
    const attachToFiche = vi.fn(async () => undefined);
    const finished = await finishConversation(
      {
        ...base,
        templates: {
          ...base.templates,
          findVersion: async () => ({
            id: "v1",
            templateId: "t1",
            version: 1,
            definition: fileDefinition,
            createdBy: null,
            createdAt: new Date(0).toISOString(),
          }),
        },
        attachments: {
          listByConversation: async () => [
            {
              id: "a1",
              organizationId: "org-1",
              conversationId: "conv-1",
              messageId: "m1",
              fieldName: "cin",
              fieldLabel: "CIN",
              originalName: "cin.png",
              mime: "image/png" as const,
              sizeBytes: 10,
              storageKey: "key",
              sha256: "hash",
              createdAt: new Date(0).toISOString(),
            },
          ],
          attachToFiche,
        } as unknown as import("@/application/ports/attachment-repository").AttachmentRepository,
      },
      "conv-1",
    );
    expect(finished.markdown).toContain("cin.png");
    expect(finished.markdown).toContain("/api/chat/attachments/a1/file");
    expect(attachToFiche).toHaveBeenCalledWith("org-1", "fiche-1", expect.any(Array));
  });
});
