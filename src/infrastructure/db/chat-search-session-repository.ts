import type { Pool } from "pg";
import type {
  ChatSearchSession,
  ChatSearchSessionRepository,
  ChatSearchSessionScope,
  ChatSearchStoredCriteria,
  CreateChatSearchSessionInput,
} from "@/application/ports/chat-search-session-repository";

type SessionRow = {
  id: string;
  organization_id: string;
  chat_link_id: string;
  conversation_id: string;
  criteria_json: unknown;
  ordered_fiche_ids: string[];
  total: number;
  offset: number;
  created_at: Date;
  expires_at: Date;
};

const COLUMNS =
  'id, organization_id, chat_link_id, conversation_id, criteria_json, ordered_fiche_ids, total, "offset", created_at, expires_at';

function toCriteria(value: unknown): ChatSearchStoredCriteria {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const stringList = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((entry): entry is string => typeof entry === "string") : [];
  return {
    query: typeof record.query === "string" ? record.query : null,
    ficheTypes: stringList(record.ficheTypes),
    conditions: Array.isArray(record.conditions)
      ? (record.conditions as ChatSearchStoredCriteria["conditions"])
      : [],
    createdFrom: typeof record.createdFrom === "string" ? record.createdFrom : null,
    createdTo: typeof record.createdTo === "string" ? record.createdTo : null,
    statusMode:
      record.statusMode === "internal_filter" || record.statusMode === "all"
        ? record.statusMode
        : "hidden_fixed",
    fixedStatusKeys: stringList(record.fixedStatusKeys),
    sortMode:
      record.sortMode === "created_at"
        ? "created_at"
        : record.sortMode === "relevance"
          ? "relevance"
          : "fair_rotation",
  };
}

function toSession(row: SessionRow): ChatSearchSession {
  return {
    id: row.id,
    organizationId: row.organization_id,
    chatLinkId: row.chat_link_id,
    conversationId: row.conversation_id,
    criteria: toCriteria(row.criteria_json),
    orderedFicheIds: row.ordered_fiche_ids ?? [],
    total: row.total,
    offset: row.offset,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

/** Adapter PostgreSQL des sessions de recherche (ADR-0067 §4.8). */
export function pgChatSearchSessionRepository(pool: Pool): ChatSearchSessionRepository {
  return {
    async create(input: CreateChatSearchSessionInput): Promise<ChatSearchSession> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Une nouvelle recherche remplace la session active de la conversation.
        await client.query(
          `DELETE FROM chat_search_sessions
            WHERE organization_id = $1 AND chat_link_id = $2 AND conversation_id = $3`,
          [input.organizationId, input.chatLinkId, input.conversationId],
        );
        const inserted = await client.query<SessionRow>(
          `INSERT INTO chat_search_sessions
             (organization_id, chat_link_id, conversation_id, criteria_json,
              ordered_fiche_ids, total, "offset", expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING ${COLUMNS}`,
          [
            input.organizationId,
            input.chatLinkId,
            input.conversationId,
            JSON.stringify(input.criteria),
            input.orderedFicheIds,
            input.total,
            input.offset,
            input.expiresAt,
          ],
        );
        const row = inserted.rows[0];
        if (row === undefined) throw new Error("Échec de création de la session de recherche");
        await client.query("COMMIT");
        return toSession(row);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async latestActive(
      scope: ChatSearchSessionScope & { now?: Date },
    ): Promise<ChatSearchSession | null> {
      const now = scope.now ?? new Date();
      const { rows } = await pool.query<SessionRow>(
        `SELECT ${COLUMNS} FROM chat_search_sessions
          WHERE organization_id = $1
            AND chat_link_id = $2
            AND conversation_id = $3
            AND expires_at > $4
          ORDER BY created_at DESC
          LIMIT 1`,
        [scope.organizationId, scope.chatLinkId, scope.conversationId, now.toISOString()],
      );
      const row = rows[0];
      return row ? toSession(row) : null;
    },

    async updateOffset(
      scope: ChatSearchSessionScope & { sessionId: string; offset: number },
    ): Promise<void> {
      await pool.query(
        `UPDATE chat_search_sessions
            SET "offset" = $1
          WHERE organization_id = $2
            AND chat_link_id = $3
            AND conversation_id = $4
            AND id = $5`,
        [
          scope.offset,
          scope.organizationId,
          scope.chatLinkId,
          scope.conversationId,
          scope.sessionId,
        ],
      );
    },

    async purgeExpired(now: Date = new Date()): Promise<number> {
      const { rowCount } = await pool.query(
        "DELETE FROM chat_search_sessions WHERE expires_at <= $1",
        [now.toISOString()],
      );
      return rowCount ?? 0;
    },
  };
}
