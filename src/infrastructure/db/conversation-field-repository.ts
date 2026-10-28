import type { Pool } from "pg";
import type {
  ConversationFieldRepository,
  ConversationFieldUpsert,
} from "@/application/ports/conversation-field-repository";
import type {
  ConversationFieldAnalysis,
  ConversationFieldSource,
  ConversationFieldValue,
} from "@/domain/entities/conversation-field";

function toIso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toSource(value: string): ConversationFieldSource {
  return value === "manual" || value === "visitor" || value === "system" ? value : "ai";
}

/** Adapter PostgreSQL des valeurs collectées et de l'état d'analyse (ADR-0045). */
export function pgConversationFieldRepository(pool: Pool): ConversationFieldRepository {
  return {
    async list(organizationId, conversationId): Promise<ConversationFieldValue[]> {
      const { rows } = await pool.query<{
        field_name: string;
        value: unknown;
        source: string;
        updated_by: string | null;
        updated_at: Date;
      }>(
        `SELECT field_name, value, source, updated_by, updated_at
           FROM conversation_field_values
          WHERE organization_id = $1 AND conversation_id = $2
          ORDER BY field_name`,
        [organizationId, conversationId],
      );
      return rows.map((row) => ({
        fieldName: row.field_name,
        value: row.value,
        source: toSource(row.source),
        updatedBy: row.updated_by,
        updatedAt: row.updated_at.toISOString(),
      }));
    },

    async upsertManual(organizationId, conversationId, values): Promise<void> {
      for (const entry of values) {
        await upsertOne(pool, organizationId, conversationId, entry, false);
      }
    },

    async upsertAi(organizationId, conversationId, values): Promise<void> {
      for (const entry of values) {
        await upsertOne(pool, organizationId, conversationId, entry, true);
      }
    },

    async getAnalysis(organizationId, conversationId): Promise<ConversationFieldAnalysis | null> {
      const { rows } = await pool.query<{
        last_analyzed_message_at: Date | null;
        last_analyzed_at: Date | null;
        status: "idle" | "ok" | "error";
        error: string | null;
      }>(
        `SELECT last_analyzed_message_at, last_analyzed_at, status, error
           FROM conversation_field_analyses
          WHERE organization_id = $1 AND conversation_id = $2`,
        [organizationId, conversationId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      return {
        lastAnalyzedMessageAt: toIso(row.last_analyzed_message_at),
        lastAnalyzedAt: toIso(row.last_analyzed_at),
        status: row.status,
        error: row.error,
      };
    },

    async saveAnalysis(organizationId, conversationId, analysis): Promise<void> {
      await pool.query(
        `INSERT INTO conversation_field_analyses
           (conversation_id, organization_id, last_analyzed_message_at, last_analyzed_at, status, error)
         VALUES ($1, $2, $3::timestamptz, $4::timestamptz, $5, $6)
         ON CONFLICT (conversation_id) DO UPDATE SET
           last_analyzed_message_at = EXCLUDED.last_analyzed_message_at,
           last_analyzed_at = EXCLUDED.last_analyzed_at,
           status = EXCLUDED.status,
           error = EXCLUDED.error,
           updated_at = now()`,
        [
          conversationId,
          organizationId,
          analysis.lastAnalyzedMessageAt,
          analysis.lastAnalyzedAt,
          analysis.status,
          analysis.error,
        ],
      );
    },
  };
}

async function upsertOne(
  pool: Pool,
  organizationId: string,
  conversationId: string,
  entry: ConversationFieldUpsert,
  protectManual: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO conversation_field_values
       (conversation_id, organization_id, field_name, value, source, updated_by)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6)
     ON CONFLICT (conversation_id, field_name) DO UPDATE SET
       value = EXCLUDED.value,
       source = EXCLUDED.source,
       updated_by = EXCLUDED.updated_by,
       updated_at = now()
     ${protectManual ? "WHERE conversation_field_values.source <> 'manual'" : ""}`,
    [
      conversationId,
      organizationId,
      entry.fieldName,
      JSON.stringify(entry.value ?? null),
      entry.source,
      entry.updatedBy,
    ],
  );
}
