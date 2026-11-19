import type { Pool } from "pg";
import type { FicheRuntimeContextRepository } from "@/application/ports/fiche-runtime-context-repository";

type DeliveryRow = {
  id: string;
  endpoint_id: string;
  endpoint_name: string;
  event_type: string | null;
  status: "succeeded" | "failed";
  response_status: number | null;
  error_code: string | null;
  error_message: string | null;
  created_at: Date;
};

type IncidentRow = {
  id: string;
  kind: string;
  title: string;
  severity: string;
  last_seen_at: Date;
  occurrences: number;
};

export function pgFicheRuntimeContextRepository(pool: Pool): FicheRuntimeContextRepository {
  return {
    async listWebhookResults(organizationId, conversationId, limit) {
      const { rows } = await pool.query<DeliveryRow>(
        `SELECT d.id, d.endpoint_id, e.name AS endpoint_name, d.event_type,
                d.status, d.response_status, d.error_code, d.error_message, d.created_at
           FROM webhook_deliveries d
           JOIN webhook_endpoints e ON e.id = d.endpoint_id
          WHERE d.organization_id = $1
            AND d.conversation_id = $2
            AND d.status IN ('succeeded', 'failed')
          ORDER BY d.created_at DESC
          LIMIT $3`,
        [organizationId, conversationId, Math.max(1, Math.min(limit, 20))],
      );
      return rows.map((row) => ({
        deliveryId: row.id,
        endpointId: row.endpoint_id,
        endpointName: row.endpoint_name,
        eventType: row.event_type,
        status: row.status,
        responseStatus: row.response_status,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        createdAt: row.created_at.toISOString(),
      }));
    },

    async listIncidents(organizationId, conversationId, limit) {
      const { rows } = await pool.query<IncidentRow>(
        `SELECT id, kind, title, severity, last_seen_at, occurrences
           FROM conversation_incidents
          WHERE organization_id = $1 AND conversation_id = $2 AND status = 'open'
          ORDER BY last_seen_at DESC
          LIMIT $3`,
        [organizationId, conversationId, Math.max(1, Math.min(limit, 20))],
      );
      return rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        title: row.title,
        severity: row.severity,
        lastSeenAt: row.last_seen_at.toISOString(),
        occurrences: row.occurrences,
      }));
    },
  };
}
