import type { ChatbotBuildSession } from "@/domain/chatbot-builder";

export type StoredChatbotBuildSession = {
  draftId: string;
  session: ChatbotBuildSession;
};

export interface ChatbotBuildSessionRepository {
  create(
    organizationId: string,
    createdBy: string | null,
    session: ChatbotBuildSession,
  ): Promise<StoredChatbotBuildSession>;
  find(organizationId: string, draftId: string): Promise<StoredChatbotBuildSession | null>;
  save(
    organizationId: string,
    draftId: string,
    session: ChatbotBuildSession,
  ): Promise<StoredChatbotBuildSession | null>;
  delete(organizationId: string, draftId: string): Promise<boolean>;
}
