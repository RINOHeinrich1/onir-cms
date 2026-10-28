import type { Pool } from "pg";
import type {
  ChatOperatorScope,
  ChatOperatorScopeRepository,
} from "@/application/ports/chat-operator-scope-repository";

/** Adapter PostgreSQL de la portée des opérateurs chat (ADR-0043). */
export function pgChatOperatorScopeRepository(pool: Pool): ChatOperatorScopeRepository {
  return {
    async findForUser(organizationId, userId): Promise<ChatOperatorScope | null> {
      const { rows } = await pool.query<{ all_links: boolean }>(
        `SELECT all_links FROM chat_operator_scopes
          WHERE organization_id = $1 AND user_id = $2`,
        [organizationId, userId],
      );
      const row = rows[0];
      if (row === undefined) return null;
      if (row.all_links) return { allLinks: true, linkIds: [] };

      const links = await pool.query<{ link_id: string }>(
        `SELECT link_id FROM chat_link_operators
          WHERE organization_id = $1 AND user_id = $2
          ORDER BY created_at ASC`,
        [organizationId, userId],
      );
      return { allLinks: false, linkIds: links.rows.map((entry) => entry.link_id) };
    },

    async setForUser(organizationId, userId, scope): Promise<ChatOperatorScope> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO chat_operator_scopes (organization_id, user_id, all_links)
           VALUES ($1, $2, $3)
           ON CONFLICT (organization_id, user_id) DO UPDATE
             SET all_links = EXCLUDED.all_links, updated_at = now()`,
          [organizationId, userId, scope.allLinks],
        );
        await client.query(
          `DELETE FROM chat_link_operators
            WHERE organization_id = $1 AND user_id = $2`,
          [organizationId, userId],
        );

        const linkIds = scope.allLinks ? [] : [...new Set(scope.linkIds)];
        if (linkIds.length > 0) {
          const inserted = await client.query(
            `INSERT INTO chat_link_operators (organization_id, link_id, user_id)
             SELECT $1, l.id, $2
               FROM chat_links l
              WHERE l.organization_id = $1 AND l.id = ANY($3::uuid[])`,
            [organizationId, userId, linkIds],
          );
          if ((inserted.rowCount ?? 0) !== linkIds.length) {
            throw new Error("Un ou plusieurs liens sont introuvables dans l'organisation");
          }
        }

        await client.query("COMMIT");
        return { allLinks: scope.allLinks, linkIds };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
