import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import { ForbiddenError, NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { sendMessage } from "@/application/use-cases/chat/send-message";
import {
  releaseConversation,
  replyAsOperator,
  takeOverConversation,
} from "@/application/use-cases/conversations/intervene";
import type { ChatLink, ChatMessage, Conversation } from "@/domain/entities/chat";

const OPERATEUR: Actor = {
  id: "op-1",
  role: "operateur",
  organizationId: "org-1",
  isSuperAdmin: false,
};

const LECTEUR: Actor = { ...OPERATEUR, id: "lect-1", role: "lecteur" };

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "c1",
    organizationId: "org-1",
    linkId: "l1",
    visitorNom: "Jean",
    visitorEmail: "jean@example.com",
    visitorContacts: [],
    prospectId: null,
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
    ...overrides,
  };
}

function message(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    conversationId: "c1",
    role: "user",
    content: "Bonjour",
    medias: [],
    mediasComputed: false,
    attachments: [],
    authorUserId: null,
    authorName: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function scopes(restricted: boolean): ChatOperatorScopeRepository {
  return {
    findForUser: async () => (restricted ? { allLinks: false, linkIds: ["l1"] } : null),
    setForUser: async (_organizationId, _userId, scope) => scope,
  };
}

function link(): ChatLink {
  return {
    id: "l1",
    organizationId: "org-1",
    label: "Site",
    type: "standard",
    surface: "page",
    identificationMode: "contact",
    prospectId: null,
    createdBy: null,
    actif: true,
    expiresAt: null,
    templateKey: "fiche-projet",
    templateVersion: 1,
    sources: { connaissances: false, phototheque: false, lien: false },
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
}

describe("intervention humaine — permissions et périmètre", () => {
  it("un lecteur ne peut pas intervenir", async () => {
    const conversations = {} as ConversationRepository;
    await expect(
      replyAsOperator({ conversations, operatorScopes: scopes(false) }, LECTEUR, "c1", "Bonjour"),
    ).rejects.toThrow(ForbiddenError);
  });

  it("refuse une conversation hors périmètre (404)", async () => {
    const conversations = {
      findById: async () => null,
    } as unknown as ConversationRepository;
    await expect(
      replyAsOperator(
        { conversations, operatorScopes: scopes(true) },
        OPERATEUR,
        "c-other",
        "Bonjour",
      ),
    ).rejects.toThrow(NotFoundError);
  });

  it("refuse une conversation finalisée", async () => {
    const conversations = {
      findById: async () => conversation({ statut: "finalisee" }),
    } as unknown as ConversationRepository;
    await expect(
      replyAsOperator({ conversations, operatorScopes: scopes(false) }, OPERATEUR, "c1", "Bonjour"),
    ).rejects.toThrow(UnprocessableError);
  });

  it("refuse un message vide ou trop long", async () => {
    const conversations = {
      findById: async () => conversation(),
    } as unknown as ConversationRepository;
    await expect(
      replyAsOperator({ conversations, operatorScopes: scopes(false) }, OPERATEUR, "c1", "  "),
    ).rejects.toThrow(/vide/i);
    await expect(
      replyAsOperator(
        { conversations, operatorScopes: scopes(false) },
        OPERATEUR,
        "c1",
        "x".repeat(4001),
      ),
    ).rejects.toThrow(/trop long/i);
  });

  it("crée un message opérateur et renvoie la conversation prise en main", async () => {
    const updated = conversation({
      interventionMode: "human",
      assignedUserId: "op-1",
      assignedOperatorName: "Opérateur",
      lastOperatorUserId: "op-1",
      lastOperatorName: "Opérateur",
    });
    const appendOperatorMessage = vi.fn(async () => ({
      message: message({ role: "operator", authorUserId: "op-1", authorName: "Opérateur" }),
      conversation: updated,
    }));
    const conversations = {
      findById: async () => conversation(),
      appendOperatorMessage,
    } as unknown as ConversationRepository;

    const result = await replyAsOperator(
      { conversations, operatorScopes: scopes(false) },
      OPERATEUR,
      "c1",
      "Bonjour, je prends le relais.",
    );
    expect(appendOperatorMessage).toHaveBeenCalledWith(
      "org-1",
      "c1",
      "Bonjour, je prends le relais.",
      "op-1",
    );
    expect(result.conversation.interventionMode).toBe("human");
    expect(result.message.role).toBe("operator");
  });

  it("prend la main puis rend la conversation à l'IA", async () => {
    const takenOver = conversation({
      interventionMode: "human",
      assignedUserId: "op-1",
      assignedOperatorName: "Opérateur",
    });
    const released = conversation({
      interventionMode: "ai",
      lastOperatorUserId: "op-1",
      lastOperatorName: "Opérateur",
    });
    const conversations = {
      findById: async () => conversation(),
      takeOverConversation: vi.fn(async () => takenOver),
      releaseConversation: vi.fn(async () => released),
    } as unknown as ConversationRepository;

    const taken = await takeOverConversation(
      { conversations, operatorScopes: scopes(false) },
      OPERATEUR,
      "c1",
    );
    expect(taken.interventionMode).toBe("human");
    const returned = await releaseConversation(
      { conversations, operatorScopes: scopes(false) },
      OPERATEUR,
      "c1",
    );
    expect(returned.interventionMode).toBe("ai");
    expect(returned.lastOperatorName).toBe("Opérateur");
  });
});

function sendDeps(
  conversationImpl: () => Promise<Conversation | null>,
  complete: AiClient["complete"],
) {
  const appendMessage = vi.fn(
    async (
      _organizationId: string,
      _conversationId: string,
      role: "user" | "assistant",
      content: string,
    ) => message({ role, content }),
  );
  const conversations = {
    findByIdPublic: conversationImpl,
    appendMessage,
    listMessages: async () => [message()],
  } as unknown as ConversationRepository;
  return {
    appendMessage,
    deps: {
      organizations: {
        findById: async () => ({
          id: "org-1",
          name: "Org",
          suspendedAt: null,
          createdBy: null,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        }),
      } as unknown as OrganizationRepository,
      links: { findById: async () => link() } as unknown as ChatLinkRepository,
      conversations,
      prospects: { findById: async () => null } as unknown as ProspectRepository,
      templates: {
        findVersion: async () => ({
          id: "v1",
          templateId: "t1",
          version: 1,
          definition: {
            key: "fiche-projet",
            label: "Fiche",
            description: "",
            systemPrompt: "x",
            fields: [],
            renderTemplate: "x",
          },
          createdBy: null,
          createdAt: new Date(0).toISOString(),
        }),
      } as unknown as ChatTemplateRepository,
      connaissances: { listActives: async () => [] } as unknown as ConnaissanceRepository,
      medias: {
        listActivesByType: async () => [],
      } as unknown as MediaRepository,
      attachments: {
        listByIds: async () => [],
        listByConversation: async () => [],
        countForField: async () => 0,
      } as unknown as AttachmentRepository,
      ai: {
        forTarget: async () => ({ complete }),
        optionalTarget: async () => ({ complete }),
      } as unknown as AiClientFactory,
    },
  };
}

describe("sendMessage — mode humain et course IA/opérateur", () => {
  it("en mode humain, enregistre le message visiteur sans appeler l'IA", async () => {
    const complete = vi.fn(async () => "réponse IA");
    const base = sendDeps(async () => conversation({ interventionMode: "human" }), complete);
    const result = await sendMessage(base.deps, { conversationId: "c1", content: "Bonjour" });
    expect(result.mode).toBe("human");
    expect(result.message).toBeNull();
    expect(complete).not.toHaveBeenCalled();
    expect(base.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("jette la réponse IA si l'opérateur prend la main pendant la génération", async () => {
    let calls = 0;
    const complete = vi.fn(async () => {
      calls += 1;
      return "réponse IA";
    });
    const base = sendDeps(async () => {
      calls += 1;
      return conversation({ interventionMode: calls >= 3 ? "human" : "ai" });
    }, complete);
    const result = await sendMessage(base.deps, { conversationId: "c1", content: "Bonjour" });
    expect(result.mode).toBe("human");
    expect(result.message).toBeNull();
    expect(base.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("en mode IA, écrit la réponse assistant", async () => {
    const complete = vi.fn(async () => "réponse IA");
    const base = sendDeps(async () => conversation({ interventionMode: "ai" }), complete);
    const result = await sendMessage(base.deps, { conversationId: "c1", content: "Bonjour" });
    expect(result.mode).toBe("ai");
    expect(result.message?.role).toBe("assistant");
    expect(base.appendMessage).toHaveBeenCalledTimes(2);
  });
});
