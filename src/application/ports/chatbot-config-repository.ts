import type { ChatbotConfig, ChatbotConfigInput } from "@/domain/entities/chatbot-config";

export interface ChatbotConfigRepository {
  currentForLink(organizationId: string, chatLinkId: string): Promise<ChatbotConfig | null>;
  findById(organizationId: string, id: string): Promise<ChatbotConfig | null>;
  listVersions(organizationId: string, chatLinkId: string): Promise<ChatbotConfig[]>;
  createVersion(
    organizationId: string,
    chatLinkId: string,
    input: ChatbotConfigInput,
    createdBy: string | null,
  ): Promise<ChatbotConfig>;
}
