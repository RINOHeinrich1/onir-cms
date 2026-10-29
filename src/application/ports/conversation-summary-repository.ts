import type { ConversationSummaryRecord } from "@/domain/entities/conversation-summary";

export type UpsertConversationSummaryInput = {
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  sourceMessageCount: number;
  sourceLastMessageAt: string | null;
  generatedWhileFinalized: boolean;
  generatedBy: string | null;
};

/** Persistance du résumé manuel (une ligne par conversation, écrasement). */
export interface ConversationSummaryRepository {
  findByConversation(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationSummaryRecord | null>;
  upsert(
    organizationId: string,
    conversationId: string,
    input: UpsertConversationSummaryInput,
  ): Promise<ConversationSummaryRecord>;
}
