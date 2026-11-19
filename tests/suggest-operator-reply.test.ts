import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import { ChatbotBlockedError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { suggestOperatorReply } from "@/application/use-cases/conversations/suggest-operator-reply";
import type { ChatLink, ChatMessage, Conversation } from "@/domain/entities/chat";

const ADMIN: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};
const OPERATEUR: Actor = { ...ADMIN, id: "op-1", role: "operateur" };
const LECTEUR: Actor = { ...ADMIN, id: "lect-1", role: "lecteur" };

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
    interventionMode: "human",
    assignedUserId: "op-1",
    assignedOperatorName: "Opérateur",
    lastOperatorUserId: null,
    lastOperatorName: null,
    humanTakeoverAt: new Date(0).toISOString(),
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
    content: "Je veux un site.",
    medias: [],
    mediasComputed: false,
    blocks: [],
    attachments: [],
    authorUserId: null,
    authorName: null,
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function link(overrides: Partial<ChatLink> = {}): ChatLink {
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
    ...overrides,
  };
}

function scopes(): ChatOperatorScopeRepository {
  return {
    findForUser: async () => null,
    setForUser: async (_organizationId, _userId, scope) => scope,
  };
}

function deps(
  options: {
    conversation?: Conversation;
    link?: ChatLink;
    messages?: ChatMessage[];
    suggestion?: string;
  } = {},
) {
  const recordAiUsage = vi.fn(async () => null);
  const appendOperatorMessage = vi.fn();
  const findById = vi.fn(async () => options.conversation ?? conversation());
  let captured: { system: string; messages: { role: string; content: string }[] } | null = null;
  const ai: AiClient = {
    complete: async (input) => {
      captured = {
        system: input.system,
        messages: input.messages.map((entry) => ({ role: entry.role, content: entry.content })),
      };
      await input.onUsage?.({ promptTokens: 10, completionTokens: 20, totalTokens: 30 });
      return options.suggestion ?? "Bonjour Jean, je peux vous aider pour votre site.";
    },
  };
  return {
    deps: {
      conversations: {
        findById,
        listMessages: async () => options.messages ?? [message()],
        appendOperatorMessage,
      } as unknown as ConversationRepository,
      operatorScopes: scopes(),
      links: {
        findById: async () => options.link ?? link(),
        recordAiUsage,
      } as unknown as ChatLinkRepository,
      ai: fixedAiClientFactory(ai),
    },
    recordAiUsage,
    appendOperatorMessage,
    findById,
    captured: () => captured,
  };
}

describe("suggestion de réponse IA en prise en main humaine (ADR-0093)", () => {
  it("génère une suggestion sans persister ni envoyer de message", async () => {
    const base = deps();
    const result = await suggestOperatorReply(base.deps, OPERATEUR, "c1");

    expect(result.suggestion).toBe("Bonjour Jean, je peux vous aider pour votre site.");
    expect(base.appendOperatorMessage).not.toHaveBeenCalled();
    expect(base.recordAiUsage).toHaveBeenCalledWith(
      "org-1",
      "l1",
      expect.objectContaining({ conversationId: "c1", operation: "reply_suggestion" }),
    );
  });

  it("demande à l'IA un texte d'opérateur et transmet l'historique", async () => {
    const base = deps({
      messages: [
        message(),
        message({ id: "m2", role: "operator", content: "Pouvez-vous préciser ?" }),
      ],
    });
    await suggestOperatorReply(base.deps, OPERATEUR, "c1");

    expect(base.captured()?.system).toContain("opérateur humain");
    expect(base.captured()?.system).toContain("pas de préambule");
    expect(base.captured()?.messages).toEqual([
      { role: "user", content: "Je veux un site." },
      { role: "assistant", content: "Pouvez-vous préciser ?" },
    ]);
  });

  it("refuse une conversation encore pilotée par l'IA", async () => {
    const base = deps({ conversation: conversation({ interventionMode: "ai" }) });
    await expect(suggestOperatorReply(base.deps, OPERATEUR, "c1")).rejects.toThrow(
      /prise en main humaine/i,
    );
  });

  it("refuse une conversation finalisée", async () => {
    const base = deps({ conversation: conversation({ statut: "finalisee" }) });
    await expect(suggestOperatorReply(base.deps, OPERATEUR, "c1")).rejects.toThrow(/finalisée/i);
  });

  it("refuse une conversation vide", async () => {
    const base = deps({ messages: [] });
    await expect(suggestOperatorReply(base.deps, OPERATEUR, "c1")).rejects.toThrow(
      /aucune suggestion/i,
    );
  });

  it("refuse un lecteur", async () => {
    const base = deps();
    await expect(suggestOperatorReply(base.deps, LECTEUR, "c1")).rejects.toThrow(/non autoris/i);
  });

  it("refuse la génération si le budget tokens est épuisé", async () => {
    const base = deps({
      link: link({
        quotas: {
          maxFiches: null,
          fichesGenerated: 0,
          maxTokens: 10,
          tokensUsed: 10,
          tokenResetMode: "manual",
          tokenResetDays: null,
          tokenPeriodStartedAt: new Date(0).toISOString(),
        },
      }),
    });
    await expect(suggestOperatorReply(base.deps, OPERATEUR, "c1")).rejects.toBeInstanceOf(
      ChatbotBlockedError,
    );
  });
});
