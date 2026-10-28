import { describe, expect, it, vi } from "vitest";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { generateFicheFromConversation } from "@/application/use-cases/conversations/generate-fiche";
import type { ChatLink, Conversation } from "@/domain/entities/chat";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";

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

const CONVERSATION: Conversation = {
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

const LINK: ChatLink = {
  id: "l1",
  organizationId: "org-1",
  label: "",
  type: "standard",
  surface: "page",
  identificationMode: "contact",
  prospectId: null,
  createdBy: null,
  actif: true,
  expiresAt: null,
  templateKey: "fiche-projet",
  templateVersion: 1,
  sources: { connaissances: true, phototheque: true, lien: true },
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
};

const PROSPECT: Prospect = {
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
};

const FICHE: Fiche = {
  id: "f1",
  organizationId: "org-1",
  conversationId: "c1",
  prospectId: "p1",
  createdBy: "admin-1",
  templateKey: "fiche-projet",
  templateVersion: 1,
  data: { sujet: "Site" },
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
};

const DEFINITION = {
  key: "fiche-projet",
  label: "Fiche",
  description: "",
  systemPrompt: "x",
  fields: [{ name: "sujet", label: "Sujet", type: "text" as const, required: false }],
  renderTemplate: "# Fiche\n\nSujet : {{sujet}}",
};

function deps() {
  const create = vi.fn(async () => FICHE);
  const markFinalisee = vi.fn(async () => undefined);
  const ai: AiClient = { complete: async () => JSON.stringify({ sujet: "Site e-commerce" }) };
  return {
    deps: {
      organizations: {
        findById: async () => ({
          id: "org-1",
          name: "Onirtech",
          suspendedAt: null,
          createdBy: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }),
      } as unknown as OrganizationRepository,
      links: { findById: async () => LINK } as unknown as ChatLinkRepository,
      operatorScopes: {
        findForUser: async () => null,
        setForUser: async (_organizationId, _userId, scope) => scope,
      } as ChatOperatorScopeRepository,
      conversations: {
        findById: async () => CONVERSATION,
        listMessages: async () => [
          {
            id: "m1",
            conversationId: "c1",
            role: "user" as const,
            content: "Je veux un site.",
            medias: [],
            mediasComputed: false,
            authorUserId: null,
            authorName: null,
            attachments: [],
            createdAt: new Date(0).toISOString(),
          },
        ],
        markFinalisee,
      } as unknown as ConversationRepository,
      prospects: { findById: async () => PROSPECT } as unknown as ProspectRepository,
      fiches: { create } as unknown as FicheRepository,
      templates: {
        findVersion: async () => ({
          id: "v1",
          templateId: "t1",
          version: 1,
          definition: DEFINITION,
          createdBy: null,
          createdAt: new Date(0).toISOString(),
        }),
      } as unknown as ChatTemplateRepository,
      attachments: {
        listByConversation: async () => [],
        attachToFiche: async () => undefined,
      } as unknown as AttachmentRepository,
      ai: fixedAiClientFactory(ai),
    },
    create,
    markFinalisee,
  };
}

describe("generateFicheFromConversation — opérateur (US-CONVERS-002)", () => {
  it("refuse un lecteur (RBAC conversations:generate_fiche)", async () => {
    const base = deps();
    await expect(generateFicheFromConversation(base.deps, LECTEUR, "c1")).rejects.toThrow(
      /non autoris/i,
    );
  });

  it("crée une fiche et NE change PAS le statut de la conversation", async () => {
    const base = deps();
    const result = await generateFicheFromConversation(base.deps, ADMIN, "c1");
    expect(base.create).toHaveBeenCalledTimes(1);
    expect(base.markFinalisee).not.toHaveBeenCalled();
    expect(result.fiche.id).toBe("f1");
  });
});
