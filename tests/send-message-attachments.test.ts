import { describe, expect, it, vi } from "vitest";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { OrganizationRepository } from "@/application/ports/organization-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import { sendMessage } from "@/application/use-cases/chat/send-message";
import type { Attachment } from "@/domain/entities/attachment";
import type { ChatMessage } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";

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
          templateKey: "demo",
          templateVersion: 1,
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
      templates: {
        findVersion: async () => ({ definition: DEFINITION }),
      } as unknown as ChatTemplateRepository,
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
