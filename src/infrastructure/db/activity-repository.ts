import type { Pool } from "pg";
import type {
  ActivityConversationRecord,
  ActivityLeadRecord,
  ActivityRepository,
} from "@/application/ports/activity-repository";

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Adapter PostgreSQL du flux d'activité et du filigrane de lecture. */
export function pgActivityRepository(pool: Pool): ActivityRepository {
  return {
    async ensureLastReadAt(organizationId, userId): Promise<string> {
      const { rows } = await pool.query<{ last_read_at: Date }>(
        `INSERT INTO notification_states (organization_id, user_id, last_read_at)
         VALUES ($1, $2, now())
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET updated_at = notification_states.updated_at
         RETURNING last_read_at`,
        [organizationId, userId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Échec de lecture du filigrane de notification");
      return row.last_read_at.toISOString();
    },

    async markRead(organizationId, userId): Promise<string> {
      const { rows } = await pool.query<{ last_read_at: Date }>(
        `INSERT INTO notification_states (organization_id, user_id, last_read_at)
         VALUES ($1, $2, now())
         ON CONFLICT (organization_id, user_id)
         DO UPDATE SET
           last_read_at = GREATEST(notification_states.last_read_at, now()),
           updated_at = now()
         RETURNING last_read_at`,
        [organizationId, userId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error("Échec de mise à jour du filigrane de notification");
      return row.last_read_at.toISOString();
    },

    async listLatestConversations(
      organizationId,
      allowedLinkIds,
      limit,
    ): Promise<ActivityConversationRecord[]> {
      const params: unknown[] = [organizationId, limit];
      let scopeClause = "";
      if (allowedLinkIds !== null) {
        params.push(allowedLinkIds);
        scopeClause = `AND cv.link_id = ANY($${params.length}::uuid[])`;
      }
      const { rows } = await pool.query<{
        id: string;
        created_at: Date;
        visitor_nom: string;
        visitor_email: string;
        link_label: string;
      }>(
        `SELECT cv.id, cv.created_at, cv.visitor_nom, cv.visitor_email, l.label AS link_label
           FROM conversations cv
           JOIN chat_links l
             ON l.id = cv.link_id AND l.organization_id = cv.organization_id
          WHERE cv.organization_id = $1
            ${scopeClause}
          ORDER BY cv.created_at DESC, cv.id DESC
          LIMIT $2`,
        params,
      );
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        visitorNom: row.visitor_nom,
        visitorEmail: row.visitor_email,
        linkLabel: toStringValue(row.link_label),
      }));
    },

    async listLatestLeads(organizationId, limit): Promise<ActivityLeadRecord[]> {
      const { rows } = await pool.query<{
        id: string;
        created_at: Date;
        template_key: string;
        data: unknown;
        prospect_nom: string | null;
        prospect_prenom: string | null;
      }>(
        `SELECT f.id, f.created_at, f.template_key, f.data,
                p.nom AS prospect_nom, p.prenom AS prospect_prenom
           FROM fiches f
           LEFT JOIN prospects p
             ON p.id = f.prospect_id AND p.organization_id = f.organization_id
          WHERE f.organization_id = $1
          ORDER BY f.created_at DESC, f.id DESC
          LIMIT $2`,
        [organizationId, limit],
      );
      return rows.map((row) => ({
        id: row.id,
        createdAt: row.created_at.toISOString(),
        templateKey: row.template_key,
        data: toRecord(row.data),
        prospectNom: row.prospect_nom,
        prospectPrenom: row.prospect_prenom,
      }));
    },

    async countConversationsSince(organizationId, since, allowedLinkIds): Promise<number> {
      const params: unknown[] = [organizationId, since];
      let scopeClause = "";
      if (allowedLinkIds !== null) {
        params.push(allowedLinkIds);
        scopeClause = `AND cv.link_id = ANY($${params.length}::uuid[])`;
      }
      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM conversations cv
          WHERE cv.organization_id = $1
            AND cv.created_at > $2::timestamptz
            ${scopeClause}`,
        params,
      );
      return rows[0]?.count ?? 0;
    },

    async countLeadsSince(organizationId, since): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM fiches f
          WHERE f.organization_id = $1
            AND f.created_at > $2::timestamptz`,
        [organizationId, since],
      );
      return rows[0]?.count ?? 0;
    },
  };
}
