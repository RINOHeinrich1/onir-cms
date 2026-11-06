import type { Pool } from "pg";
import type { ChatbotBuilderDependencies } from "@/application/use-cases/chatbot-builder/manage-chatbot-builder";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { chatbotBuildSessionRepository } from "@/infrastructure/db/chatbot-build-session-repository";
import { pgChatbotDraftRepository } from "@/infrastructure/db/chatbot-draft-repository";
import { officeDocumentExtractor } from "@/infrastructure/documents/office-document-extractor";
import { siteContextReader } from "@/infrastructure/web/site-context-reader";

export function chatbotBuilderDependencies(pool: Pool): ChatbotBuilderDependencies {
  return {
    sessions: chatbotBuildSessionRepository(pgChatbotDraftRepository(pool)),
    aiFactory: pgAiClientFactory(pool),
    documents: officeDocumentExtractor(),
    websites: siteContextReader(),
  };
}
