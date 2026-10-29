import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import { ChatbotBlockedError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import { fixedAiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { ConversationSummaryRepository } from "@/application/ports/conversation-summary-repository";
import {
  buildSummaryTranscript,
  generateConversationSummary,
  getConversationSummary,
} from "@/application/use-cases/conversations/conversation-summary";
import type { ChatLink, ChatMessage, Conversation } from "@/domain/entities/chat";
import type { ConversationSummaryRecord } from "@/domain/entities/conversation-summary";

const ADMIN: Actor = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};
const OPERATEUR: Actor = { ...ADMIN, id: "op-1", role: "operateur" };
const LECTEUR: Actor = { ...ADMIN, id: "lect-1", role: "lecteur" };

const SUMMARY: ConversationSummaryRecord = {
  id: "s1",
  organizationId: "org-1",
  conversationId: "c1",
  content: "Le visiteur veut un site.",
  provider: "test",
  model: "test",
  tokensUsed: 42,
  sourceMessageCount: 2,
  sourceLastMessageAt: new Date(0).toISOString(),
  generatedWhileFinalized: false,
  generatedBy: "op-1",
  generatedAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

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
    content: "Je veux un site.",
    medias: [],
    mediasComputed: false,
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
    ...overrides,
  };
}

function scopes(restricted = false): ChatOperatorScopeRepository {
  return {
    findForUser: async () => (restricted ? { allLinks: false, linkIds: ["l1"] } : null),
    setForUser: async (_organizationId, _userId, scope) => scope,
  };
}

function deps(options: { link?: ChatLink; messages?: ChatMessage[] } = {}) {
  const upsert = vi.fn(async (...args: unknown[]) => {
    void args;
    return SUMMARY;
  });
  const recordAiUsage = vi.fn(async () => null);
  const findSummary = vi.fn(async () => null);
  const ai: AiClient = {
    complete: async (input) => {
      expect(input.system).toContain("résumes");
      await input.onUsage?.({ promptTokens: 10, completionTokens: 32, totalTokens: 42 });
      return "Le visiteur souhaite créer un site e-commerce.";
    },
  };
  return {
    deps: {
      conversations: {
        findById: async () => conversation(),
        listMessages: async () =>
          options.messages ?? [message(), message({ id: "m2", role: "assistant" })],
      } as unknown as ConversationRepository,
      operatorScopes: scopes(),
      links: {
        findById: async () => options.link ?? link(),
        recordAiUsage,
      } as unknown as ChatLinkRepository,
      summaries: {
        findByConversation: findSummary,
        upsert,
      } as unknown as ConversationSummaryRepository,
      ai: fixedAiClientFactory(ai),
    },
    upsert,
    recordAiUsage,
    findSummary,
  };
}

describe("résumé manuel de conversation (ADR-0054)", () => {
  it("génère et enregistre le résumé avec l'usage tokens", async () => {
    const base = deps();
    const result = await generateConversationSummary(base.deps, OPERATEUR, "c1");
    expect(result).toEqual(SUMMARY);
    expect(base.upsert).toHaveBeenCalledWith(
      "org-1",
      "c1",
      expect.objectContaining({
        content: "Le visiteur souhaite créer un site e-commerce.",
        sourceMessageCount: 2,
        generatedWhileFinalized: false,
        generatedBy: "op-1",
      }),
    );
    expect(base.recordAiUsage).toHaveBeenCalledWith(
      "org-1",
      "l1",
      expect.objectContaining({ conversationId: "c1", operation: "conversation_summary" }),
    );
  });

  it("refuse un lecteur en génération mais autorise la lecture", async () => {
    const base = deps();
    await expect(generateConversationSummary(base.deps, LECTEUR, "c1")).rejects.toThrow(
      /non autoris/i,
    );
    await expect(getConversationSummary(base.deps, LECTEUR, "c1")).resolves.toBeNull();
  });

  it("refuse une conversation vide", async () => {
    const base = deps({ messages: [] });
    await expect(generateConversationSummary(base.deps, ADMIN, "c1")).rejects.toThrow(
      /aucun message/i,
    );
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
    await expect(generateConversationSummary(base.deps, ADMIN, "c1")).rejects.toBeInstanceOf(
      ChatbotBlockedError,
    );
  });

  it("borne le transcript sans perdre le dernier message", () => {
    const transcript = buildSummaryTranscript([
      message({ content: "ancien" }),
      message({ id: "m2", content: "dernier" }),
    ]);
    expect(transcript).toContain("dernier");
  });
});
