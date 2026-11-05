import { describe, expect, it, vi } from "vitest";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { sendMessage } from "@/application/use-cases/chat/send-message";
import type { ChatMessage } from "@/domain/entities/chat";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import { defaultChatbotInformationSources } from "@/domain/entities/chatbot-information";

const SIMPLE = {
  role: "assistant",
  objective: "informer",
  language: { mode: "auto" as const },
  tone: "",
  guardrails: [],
  extraInstructions: "",
};

function config(): ChatbotConfig {
  const sources = defaultChatbotInformationSources();
  sources.connaissances.enabled = true;
  return {
    id: "cfg-1",
    organizationId: "org-1",
    chatLinkId: "link-1",
    version: 2,
    mission: "inform",
    informationSources: sources,
    behaviorMode: "guided",
    systemPrompt: "",
    simple: SIMPLE,
    fiches: [],
    dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
    searchTool: {
      enabled: false,
      ficheTypes: [],
      statusMode: "hidden_fixed",
      fixedStatusKeys: [],
      sortMode: "fair_rotation",
    },
    createdBy: null,
    createdAt: new Date(0).toISOString(),
  };
}

function message(role: "user" | "assistant", content: string): ChatMessage {
  return {
    id: role,
    conversationId: "conv-1",
    role,
    content,
    medias: [],
    mediasComputed: true,
    blocks: [],
    authorUserId: null,
    authorName: null,
    attachments: [],
    createdAt: new Date(0).toISOString(),
  };
}

describe("sendMessage — mission inform", () => {
  it("utilise la source connaissances sans injecter de collecte", async () => {
    const appendMessage = vi.fn(
      async (
        _organizationId: string,
        _conversationId: string,
        role: "user" | "assistant",
        content: string,
      ) => message(role, content),
    );
    const aiClient = {
      capabilities: { supportsToolCalling: false },
      complete: vi.fn(async ({ system }: { system: string }) => {
        if (system.includes("sélectionnes"))
          return JSON.stringify({ titres: ["Contact MandamPro"] });
        expect(system).toContain("Mission : informer");
        expect(system).not.toContain("Informations à collecter");
        return "Le contact est disponible dans la base.";
      }),
    };
    const ai = {
      forTarget: async () => aiClient,
    } as unknown as AiClientFactory;

    const result = await sendMessage(
      {
        organizations: {
          findById: async () => ({ suspendedAt: null }),
        } as unknown as OrganizationRepository,
        links: {
          findById: async () => ({
            id: "link-1",
            organizationId: "org-1",
            actif: true,
            currentConfigId: "cfg-1",
            type: "standard",
            sources: { connaissances: true, phototheque: false, lien: false },
            aiProviderId: null,
            aiModel: null,
            quotas: { maxFiches: null, maxTokens: null, fichesGenerated: 0, tokensUsed: 0 },
          }),
          recordAiUsage: async () => undefined,
        } as unknown as ChatLinkRepository,
        conversations: {
          findByIdPublic: async () => ({
            id: "conv-1",
            organizationId: "org-1",
            linkId: "link-1",
            statut: "en_cours",
            interventionMode: "ai",
            prospectId: null,
          }),
          listMessages: async () => [message("user", "Contact MandamPro ?")],
          appendMessage,
        } as unknown as ConversationRepository,
        prospects: {} as ProspectRepository,
        connaissances: {
          listActivesForChatLink: async () => [
            {
              id: "k1",
              organizationId: "org-1",
              titre: "Contact MandamPro",
              contenu: "contact@mandampro.mg",
              chatLinkIds: [],
              actif: true,
              createdBy: null,
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString(),
            },
          ],
        } as unknown as ConnaissanceRepository,
        medias: {} as MediaRepository,
        attachments: {
          listByConversation: async () => [],
          listByIds: async () => [],
          countForField: async () => 0,
        } as unknown as AttachmentRepository,
        ai,
        configs: {
          findById: async () => config(),
        } as unknown as ChatbotConfigRepository,
      },
      { conversationId: "conv-1", content: "Contact MandamPro ?" },
    );

    expect(result.message?.content).toContain("contact");
    expect(result.connaissances).toEqual([{ ref: "k1", titre: "Contact MandamPro" }]);
    expect(result.mediaPending).toBe(false);
    expect(appendMessage).toHaveBeenCalledTimes(2);
    expect(aiClient.complete).toHaveBeenCalled();
  });
});
