import type { Pool } from "pg";
import type {
  CreateFicheEventInput,
  FicheEventRepository,
} from "@/application/ports/fiche-event-repository";
import {
  type FicheEventPayload,
  type FicheLifecycleEvent,
  isFicheWebhookEventType,
} from "@/domain/entities/webhook-event";

type Row = {
  id: string;
  organization_id: string;
  event_type: string;
  source: "draft" | "fiche";
  chat_link_id: string | null;
  config_id: string | null;
  fiche_key: string;
  conversation_id: string | null;
  fiche_instance_id: string | null;
  fiche_id: string | null;
  field_key: string | null;
  field_keys: string[] | null;
  status: FicheLifecycleEvent["status"];
  payload: unknown;
  occurred_at: Date;
  dispatched_at: Date | null;
  error_message: string | null;
};

const COLUMNS =
  "id, organization_id, event_type, source, chat_link_id, config_id, fiche_key, conversation_id, fiche_instance_id, fiche_id, field_key, field_keys, status, payload, occurred_at, dispatched_at, error_message";

function toEvent(row: Row): FicheLifecycleEvent {
  if (!isFicheWebhookEventType(row.event_type)) {
    throw new Error(`Type d'événement webhook inconnu : ${row.event_type}`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    eventType: row.event_type,
    source: row.source,
    chatLinkId: row.chat_link_id,
    configId: row.config_id,
    ficheKey: row.fiche_key,
    conversationId: row.conversation_id,
    ficheInstanceId: row.fiche_instance_id,
    ficheId: row.fiche_id,
    fieldKey: row.field_key,
    fieldKeys: row.field_keys,
    status: row.status,
    payload: (row.payload ?? {}) as FicheEventPayload,
    occurredAt: row.occurred_at.toISOString(),
    dispatchedAt: row.dispatched_at?.toISOString() ?? null,
    errorMessage: row.error_message,
  };
}

export function pgFicheEventRepository(pool: Pool): FicheEventRepository {
  return {
    async create(input: CreateFicheEventInput) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO fiche_lifecycle_events
           (organization_id, event_type, source, chat_link_id, config_id, fiche_key,
            conversation_id, fiche_instance_id, fiche_id, field_key, field_keys, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
         RETURNING ${COLUMNS}`,
        [
          input.organizationId,
          input.eventType,
          input.source,
          input.chatLinkId,
          input.configId,
          input.ficheKey,
          input.conversationId,
          input.ficheInstanceId,
          input.ficheId,
          input.fieldKey,
          input.fieldKeys ?? null,
          JSON.stringify(input.payload),
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de l'événement webhook");
      return toEvent(row);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM fiche_lifecycle_events
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEvent(rows[0]) : null;
    },

    async listPending(limit) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM fiche_lifecycle_events
          WHERE status = 'pending'
          ORDER BY occurred_at ASC
          LIMIT $1`,
        [Math.max(1, Math.min(limit, 100))],
      );
      return rows.map(toEvent);
    },

    async markDispatched(organizationId, id) {
      await pool.query(
        `UPDATE fiche_lifecycle_events
            SET status = 'dispatched', dispatched_at = now(), error_message = NULL
          WHERE organization_id = $1 AND id = $2 AND status = 'pending'`,
        [organizationId, id],
      );
    },

    async markFailed(organizationId, id, message) {
      await pool.query(
        `UPDATE fiche_lifecycle_events
            SET status = 'failed', error_message = $3
          WHERE organization_id = $1 AND id = $2 AND status = 'pending'`,
        [organizationId, id, message.slice(0, 2000)],
      );
    },

    async markPayloadIncomplete(organizationId, id, message) {
      await pool.query(
        `UPDATE fiche_lifecycle_events
            SET status = 'payload_incomplete', error_message = $3
          WHERE organization_id = $1 AND id = $2 AND status = 'pending'`,
        [organizationId, id, message.slice(0, 2000)],
      );
    },
  };
}
