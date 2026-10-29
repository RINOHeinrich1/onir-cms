/** Résumé manuel d'une conversation, indépendant des fiches de collecte (ADR-0054). */
export type ConversationSummaryRecord = {
  id: string;
  organizationId: string;
  conversationId: string;
  content: string;
  provider: string;
  model: string;
  tokensUsed: number;
  sourceMessageCount: number;
  sourceLastMessageAt: string | null;
  generatedWhileFinalized: boolean;
  generatedBy: string | null;
  generatedAt: string;
  updatedAt: string;
};
