import type {
  ConversationFieldAnalysis,
  ConversationFieldSource,
  ConversationFieldValue,
} from "@/domain/entities/conversation-field";

export type ConversationFieldUpsert = {
  fieldName: string;
  value: unknown;
  source: ConversationFieldSource;
  updatedBy: string | null;
};

export interface ConversationFieldRepository {
  list(organizationId: string, conversationId: string): Promise<ConversationFieldValue[]>;

  /** Écriture humaine : écrase toujours la valeur précédente. */
  upsertManual(
    organizationId: string,
    conversationId: string,
    values: ConversationFieldUpsert[],
  ): Promise<void>;

  /** Écriture IA : ne remplace jamais une valeur manuelle. */
  upsertAi(
    organizationId: string,
    conversationId: string,
    values: ConversationFieldUpsert[],
  ): Promise<void>;

  getAnalysis(
    organizationId: string,
    conversationId: string,
  ): Promise<ConversationFieldAnalysis | null>;

  saveAnalysis(
    organizationId: string,
    conversationId: string,
    analysis: ConversationFieldAnalysis,
  ): Promise<void>;
}
