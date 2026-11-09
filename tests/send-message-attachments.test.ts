import { describe, expect, it, vi } from "vitest";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { sendMessage } from "@/application/use-cases/chat/send-message";
import type { Attachment } from "@/domain/entities/attachment";
import type { ChatMessage } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type { ConversationFicheInstance } from "@/domain/entities/conversation-fiche-instance";

const DEFINITION: TemplateDefinition = {
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

const FICHE = {
  key: DEFINITION.key,
  label: DEFINITION.label,
  description: DEFINITION.description,
  intent: "",
  fields: DEFINITION.fields,
  renderTemplate: DEFINITION.renderTemplate,
  instructions: "",
};

const CONFIG: ChatbotConfig = {
  id: "cfg-1",
  organizationId: "org-1",
  chatLinkId: "link-1",
  version: 1,
  behaviorMode: "expert",
  collectionMode: "ai",
  systemPrompt: DEFINITION.systemPrompt,
  simple: {
    role: "assistant",
    objective: "",
    language: { mode: "auto" },
    tone: "",
    guardrails: [],
    extraInstructions: "",
  },
  fiches: [FICHE],
  dataSelection: { mode: "all", connaissanceIds: [], mediaIds: [] },
  createdBy: null,
  createdAt: new Date(0).toISOString(),
};

const INSTANCE: ConversationFicheInstance = {
  id: "inst-1",
  organizationId: "org-1",
  conversationId: "conv-1",
  configId: CONFIG.id,
  ficheKey: FICHE.key,
  instanceKey: "default",
  status: "active",
  data: {},
  missingFields: [],
  abandonReason: null,
  detectedAt: new Date(0).toISOString(),
  completedAt: null,
  updatedAt: new Date(0).toISOString(),
};

const ATTACHMENT: Attachment = {
  id: "a1",
  organizationId: "org-1",
  conversationId: "conv-1",
  messageId: null,
  fieldName: "cin",
  fieldLabel: "CIN",
  originalName: "cin.png",
  mime: "image/png",
  sizeBytes: 10,
  storageKey: "key",
  sha256: "hash",
  createdAt: new Date(0).toISOString(),
};

function deps() {
  const appendMessage = vi.fn(
    async (
      _organizationId: string,
      _conversationId: string,
      role: "user" | "assistant",
      content: string,
    ): Promise<ChatMessage> => ({
      id: "m1",
      conversationId: "conv-1",
      role,
      content,
      medias: [],
      mediasComputed: false,
      blocks: [],
      authorUserId: null,
      authorName: null,
      attachments:
        role === "user"
          ? [
              {
                id: "a1",
                conversationId: "conv-1",
                messageId: "m1",
                fieldName: "cin",
                fieldLabel: "CIN",
                originalName: "cin.png",
                mime: "image/png",
                sizeBytes: 10,
                createdAt: new Date(0).toISOString(),
              },
            ]
          : [],
      createdAt: new Date(0).toISOString(),
    }),
  );
  const ai = {
    forTarget: vi.fn(async () => {
      throw new Error("IA appelée");
    }),
  } as unknown as AiClientFactory;
  return {
    appendMessage,
    ai,
    deps: {
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
          sources: { connaissances: false, phototheque: false, lien: false },
          aiProviderId: null,
          aiModel: null,
        }),
      } as unknown as ChatLinkRepository,
      conversations: {
        findByIdPublic: async () => ({
          id: "conv-1",
          organizationId: "org-1",
          linkId: "link-1",
          statut: "en_cours",
          prospectId: null,
        }),
        appendMessage,
      } as unknown as ConversationRepository,
      prospects: {} as ProspectRepository,
      configs: {
        findById: async () => CONFIG,
        currentForLink: async () => CONFIG,
        listVersions: async () => [CONFIG],
        createVersion: async () => CONFIG,
      } as unknown as ChatbotConfigRepository,
      ficheInstances: {
        listByConversation: async () => [],
        findById: async () => null,
        upsert: async () => INSTANCE,
        update: async () => INSTANCE,
        activate: async () => INSTANCE,
      } as unknown as ConversationFicheInstanceRepository,
      connaissances: {} as ConnaissanceRepository,
      medias: {} as MediaRepository,
      attachments: {
        listByIds: async () => [ATTACHMENT],
        countForField: async () => 1,
      } as unknown as AttachmentRepository,
      ai,
    },
  };
}

describe("sendMessage — pièces jointes sans IA", () => {
  it("enregistre un message fichier seul et n'appelle pas l'IA", async () => {
    const base = deps();
    const result = await sendMessage(base.deps, {
      conversationId: "conv-1",
      content: "",
      attachmentIds: ["a1"],
    });
    expect(base.ai.forTarget).not.toHaveBeenCalled();
    expect(base.appendMessage).toHaveBeenCalledTimes(1);
    expect(result.message).toBeNull();
    expect(result.userMessage.attachments).toHaveLength(1);
  });
});

describe("sendMessage — rappel de langue du mode Simple", () => {
  it("ajoute le rappel après le prompt système enrichi", async () => {
    const base = deps();
    const definition: TemplateDefinition = {
      ...DEFINITION,
      fields: [],
      renderTemplate: "# Fiche\n\nDate : {{date}}",
      simple: {
        role: "un assistant",
        objective: "",
        language: { mode: "auto" },
        tone: "",
        guardrails: [],
        extraInstructions: "",
      },
    };
    let capturedSystem = "";
    const ai = {
      forTarget: async () => ({
        complete: async ({ system }: { system: string }) => {
          capturedSystem = system;
          return "Bonjour";
        },
      }),
    } as unknown as AiClientFactory;
    const testDeps = {
      ...base.deps,
      links: {
        findById: async () => ({
          id: "link-1",
          organizationId: "org-1",
          actif: true,
          currentConfigId: "cfg-1",
          type: "libre",
          aiProviderId: null,
          aiModel: null,
          sources: { connaissances: false, phototheque: false, lien: false },
        }),
      } as unknown as ChatLinkRepository,
      configs: {
        findById: async () => ({
          ...CONFIG,
          simple: definition.simple ?? CONFIG.simple,
          fiches: [{ ...FICHE, fields: [], renderTemplate: definition.renderTemplate }],
        }),
        currentForLink: async () => ({
          ...CONFIG,
          simple: definition.simple ?? CONFIG.simple,
          fiches: [{ ...FICHE, fields: [], renderTemplate: definition.renderTemplate }],
        }),
        listVersions: async () => [CONFIG],
        createVersion: async () => CONFIG,
      } as unknown as ChatbotConfigRepository,
      conversations: {
        ...base.deps.conversations,
        listMessages: async () => [],
      } as unknown as ConversationRepository,
      attachments: {
        ...base.deps.attachments,
        listByConversation: async () => [],
      } as unknown as AttachmentRepository,
      ai,
    };
    await sendMessage(testDeps, { conversationId: "conv-1", content: "Bonjour" });
    expect(capturedSystem).toContain("Rappel : réponds dans la langue du visiteur");
  });
});
