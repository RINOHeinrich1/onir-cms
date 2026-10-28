import type { Pool } from "pg";
import type {
  ConversationIncidentRecord,
  ConversationIncidentRepository,
  RecordConversationIncidentInput,
} from "@/application/ports/conversation-incident-repository";
import type { ConversationIncidentKind } from "@/domain/entities/conversation-incident";

type IncidentRow = {
  id: string;
  organization_id: string;
  conversation_id: string;
  kind: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  detail: string;
  status: "open" | "resolved";
  occurrences: number;
  first_seen_at: Date;
  last_seen_at: Date;
  resolved_at: Date | null;
  resolved_by: string | null;
  visitor_nom: string;
  visitor_email: string;
  link_label: string;
};

function toKind(value: string): ConversationIncidentKind {
  return value === "fiche_generation_failed" || value === "field_extraction_failed"
    ? value
    : "ai_reply_failed";
}

function toRecord(row: IncidentRow): ConversationIncidentRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    kind: toKind(row.kind),
    severity: row.severity,
    title: row.title,
    detail: row.detail,
    status: row.status,
    occurrences: row.occurrences,
    firstSeenAt: row.first_seen_at.toISOString(),
    lastSeenAt: row.last_seen_at.toISOString(),
    resolvedAt: row.resolved_at === null ? null : row.resolved_at.toISOString(),
    resolvedBy: row.resolved_by,
    visitorNom: row.visitor_nom,
    visitorEmail: row.visitor_email,
    linkLabel: row.link_label,
  };
}

const SELECT_INCIDENT = `SELECT i.id, i.organization_id, i.conversation_id, i.kind, i.severity,
       i.title, i.detail, i.status, i.occurrences, i.first_seen_at, i.last_seen_at,
       i.resolved_at, i.resolved_by,
       cv.visitor_nom, cv.visitor_email, l.label AS link_label
  FROM conversation_incidents i
  JOIN conversations cv ON cv.id = i.conversation_id AND cv.organization_id = i.organization_id
  JOIN chat_links l ON l.id = cv.link_id AND l.organization_id = cv.organization_id`;

/** Adapter PostgreSQL des incidents de conversation (ADR-0046). */
export function pgConversationIncidentRepository(pool: Pool): ConversationIncidentRepository {
  return {
    async record(input: RecordConversationIncidentInput): Promise<void> {
      await pool.query(
        `INSERT INTO conversation_incidents
           (organization_id, conversation_id, kind, severity, title, detail)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (conversation_id, kind) WHERE status = 'open' DO UPDATE SET
           severity = EXCLUDED.severity,
           title = EXCLUDED.title,
           detail = EXCLUDED.detail,
           occurrences = conversation_incidents.occurrences + 1,
           last_seen_at = now()`,
        [
          input.organizationId,
          input.conversationId,
          input.kind,
          input.severity,
          input.title,
          input.detail,
        ],
      );
    },

    async listOpen(organizationId, allowedLinkIds): Promise<ConversationIncidentRecord[]> {
      const params: unknown[] = [organizationId];
      let scope = "";
      if (allowedLinkIds !== null) {
        params.push(allowedLinkIds);
        scope = `AND cv.link_id = ANY($${params.length}::uuid[])`;
      }
      const { rows } = await pool.query<IncidentRow>(
        `${SELECT_INCIDENT}
          WHERE i.organization_id = $1 AND i.status = 'open' ${scope}
          ORDER BY i.last_seen_at DESC, i.id DESC
          LIMIT 50`,
        params,
      );
      return rows.map(toRecord);
    },

    async countOpen(organizationId, allowedLinkIds): Promise<number> {
      const params: unknown[] = [organizationId];
      let scope = "";
      if (allowedLinkIds !== null) {
        params.push(allowedLinkIds);
        scope = `AND cv.link_id = ANY($${params.length}::uuid[])`;
      }
      const { rows } = await pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
           FROM conversation_incidents i
           JOIN conversations cv ON cv.id = i.conversation_id AND cv.organization_id = i.organization_id
          WHERE i.organization_id = $1 AND i.status = 'open' ${scope}`,
        params,
      );
      return rows[0]?.count ?? 0;
    },

    async listForConversation(
      organizationId,
      conversationId,
    ): Promise<ConversationIncidentRecord[]> {
      const { rows } = await pool.query<IncidentRow>(
        `${SELECT_INCIDENT}
          WHERE i.organization_id = $1 AND i.conversation_id = $2 AND i.status = 'open'
          ORDER BY i.last_seen_at DESC, i.id DESC`,
        [organizationId, conversationId],
      );
      return rows.map(toRecord);
    },

    async resolve(
      organizationId,
      incidentId,
      userId,
      allowedLinkIds,
    ): Promise<ConversationIncidentRecord | null> {
      const params: unknown[] = [organizationId, incidentId, userId];
      let scope = "";
      if (allowedLinkIds !== null) {
        params.push(allowedLinkIds);
        scope = `AND cv.link_id = ANY($${params.length}::uuid[])`;
      }
      const { rows } = await pool.query<{ id: string }>(
        `UPDATE conversation_incidents i
            SET status = 'resolved', resolved_at = now(), resolved_by = $3
           FROM conversations cv
          WHERE i.id = $2
            AND i.organization_id = $1
            AND cv.id = i.conversation_id
            AND cv.organization_id = i.organization_id
            AND i.status = 'open'
            ${scope}
          RETURNING i.id`,
        params,
      );
      const id = rows[0]?.id;
      if (id === undefined) return null;
      const { rows: resolved } = await pool.query<IncidentRow>(
        `${SELECT_INCIDENT} WHERE i.id = $1 AND i.organization_id = $2`,
        [id, organizationId],
      );
      return resolved[0] === undefined ? null : toRecord(resolved[0]);
    },
  };
}
