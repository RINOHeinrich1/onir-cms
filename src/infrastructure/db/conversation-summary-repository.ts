import type { Pool } from "pg";
import type {
  ConversationSummaryRepository,
  UpsertConversationSummaryInput,
} from "@/application/ports/conversation-summary-repository";
import type { ConversationSummaryRecord } from "@/domain/entities/conversation-summary";

type Row = {
  id: string;
  organization_id: string;
  conversation_id: string;
  content: string;
  provider: string;
  model: string;
  tokens_used: string;
  source_message_count: number;
  source_last_message_at: Date | null;
  generated_while_finalized: boolean;
  generated_by: string | null;
  generated_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, conversation_id, content, provider, model, tokens_used, source_message_count, source_last_message_at, generated_while_finalized, generated_by, generated_at, updated_at";

function toEntity(row: Row): ConversationSummaryRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    content: row.content,
    provider: row.provider,
    model: row.model,
    tokensUsed: Number(row.tokens_used),
    sourceMessageCount: row.source_message_count,
    sourceLastMessageAt: row.source_last_message_at?.toISOString() ?? null,
    generatedWhileFinalized: row.generated_while_finalized,
    generatedBy: row.generated_by,
    generatedAt: row.generated_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du résumé manuel de conversation (ADR-0054). */
export function pgConversationSummaryRepository(pool: Pool): ConversationSummaryRepository {
  return {
    async findByConversation(organizationId, conversationId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM conversation_summaries
          WHERE organization_id = $1 AND conversation_id = $2`,
        [organizationId, conversationId],
      );
      return rows[0] === undefined ? null : toEntity(rows[0]);
    },

    async upsert(organizationId, conversationId, input: UpsertConversationSummaryInput) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO conversation_summaries
           (organization_id, conversation_id, content, provider, model, tokens_used,
            source_message_count, source_last_message_at, generated_while_finalized, generated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (conversation_id) DO UPDATE
           SET content = EXCLUDED.content,
               provider = EXCLUDED.provider,
               model = EXCLUDED.model,
               tokens_used = EXCLUDED.tokens_used,
               source_message_count = EXCLUDED.source_message_count,
               source_last_message_at = EXCLUDED.source_last_message_at,
               generated_while_finalized = EXCLUDED.generated_while_finalized,
               generated_by = EXCLUDED.generated_by,
               generated_at = now(),
               updated_at = now()
           WHERE conversation_summaries.organization_id = EXCLUDED.organization_id
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          conversationId,
          input.content,
          input.provider,
          input.model,
          input.tokensUsed,
          input.sourceMessageCount,
          input.sourceLastMessageAt,
          input.generatedWhileFinalized,
          input.generatedBy,
        ],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Résumé de conversation non enregistré");
      return toEntity(row);
    },
  };
}
