import type { Pool } from "pg";
import type {
  CreateWebhookDeliveryInput,
  WebhookDeliveryFilter,
  WebhookDeliveryRepository,
  WebhookDeliveryResult,
} from "@/application/ports/webhook-delivery-repository";
import {
  isWebhookDeliveryStatus,
  type WebhookDelivery,
  type WebhookDeliveryAttempt,
  type WebhookDeliveryStatus,
  type WebhookRequestSnapshot,
} from "@/domain/entities/webhook";

type DeliveryRow = {
  id: string;
  organization_id: string;
  endpoint_id: string;
  fiche_id: string | null;
  template_key: string;
  template_version: number;
  is_test: boolean;
  replay_of_id: string | null;
  status: string;
  attempts: number;
  next_attempt_at: Date | null;
  idempotency_key: string;
  request_snapshot: unknown;
  response_status: number | null;
  response_body: string | null;
  error_code: string | null;
  error_message: string | null;
  triggered_by: string | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

type AttemptRow = {
  id: string;
  delivery_id: string;
  attempt: number;
  status: string;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
};

const COLUMNS =
  "id, organization_id, endpoint_id, fiche_id, template_key, template_version, is_test, replay_of_id, status, attempts, next_attempt_at, idempotency_key, request_snapshot, response_status, response_body, error_code, error_message, triggered_by, started_at, finished_at, created_at";

function toDelivery(row: DeliveryRow): WebhookDelivery {
  if (!isWebhookDeliveryStatus(row.status)) {
    throw new Error(`Statut de livraison inconnu : ${row.status}`);
  }
  const snapshot =
    row.request_snapshot !== null &&
    typeof row.request_snapshot === "object" &&
    !Array.isArray(row.request_snapshot)
      ? (row.request_snapshot as WebhookRequestSnapshot)
      : null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    endpointId: row.endpoint_id,
    ficheId: row.fiche_id,
    templateKey: row.template_key,
    templateVersion: row.template_version,
    isTest: row.is_test,
    replayOfId: row.replay_of_id,
    status: row.status as WebhookDeliveryStatus,
    attempts: row.attempts,
    nextAttemptAt: row.next_attempt_at?.toISOString() ?? null,
    idempotencyKey: row.idempotency_key,
    requestSnapshot: snapshot,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    triggeredBy: row.triggered_by,
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function toAttempt(row: AttemptRow): WebhookDeliveryAttempt {
  return {
    id: String(row.id),
    deliveryId: row.delivery_id,
    attempt: row.attempt,
    status: row.status,
    httpStatus: row.http_status,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    durationMs: row.duration_ms,
    startedAt: row.started_at?.toISOString() ?? null,
    finishedAt: row.finished_at?.toISOString() ?? null,
    createdAt: row.created_at.toISOString(),
  };
}

function resultParams(result: WebhookDeliveryResult): unknown[] {
  return [
    result.status,
    result.body === null ? null : result.body.slice(0, 64 * 1024),
    result.errorCode,
    result.errorMessage === null ? null : result.errorMessage.slice(0, 2000),
  ];
}

/** Adapter PostgreSQL de la file et du journal des livraisons webhook. */
export function pgWebhookDeliveryRepository(pool: Pool): WebhookDeliveryRepository {
  return {
    async create(organizationId, input: CreateWebhookDeliveryInput) {
      const { rows } = await pool.query<DeliveryRow>(
        `INSERT INTO webhook_deliveries
           (organization_id, endpoint_id, fiche_id, template_key, template_version,
            is_test, replay_of_id, status, attempts, next_attempt_at, idempotency_key,
            request_snapshot, triggered_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'queued', 0, now(), $8, $9, $10)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.endpointId,
          input.ficheId,
          input.templateKey,
          input.templateVersion,
          input.isTest,
          input.replayOfId,
          input.idempotencyKey,
          input.requestSnapshot === null ? null : JSON.stringify(input.requestSnapshot),
          input.triggeredBy,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la livraison webhook");
      return toDelivery(row);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<DeliveryRow>(
        `SELECT ${COLUMNS} FROM webhook_deliveries
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toDelivery(rows[0]) : null;
    },

    async list(organizationId, filter: WebhookDeliveryFilter = {}) {
      const clauses = ["organization_id = $1"];
      const params: unknown[] = [organizationId];
      if (filter.endpointId !== undefined && filter.endpointId !== null) {
        params.push(filter.endpointId);
        clauses.push(`endpoint_id = $${params.length}`);
      }
      if (filter.ficheId !== undefined && filter.ficheId !== null) {
        params.push(filter.ficheId);
        clauses.push(`fiche_id = $${params.length}`);
      }
      if (filter.status !== undefined && filter.status !== null) {
        params.push(filter.status);
        clauses.push(`status = $${params.length}`);
      }
      const limit = Math.max(1, Math.min(filter.limit ?? 100, 500));
      params.push(limit);
      const { rows } = await pool.query<DeliveryRow>(
        `SELECT ${COLUMNS} FROM webhook_deliveries
          WHERE ${clauses.join(" AND ")}
          ORDER BY created_at DESC
          LIMIT $${params.length}`,
        params,
      );
      return rows.map(toDelivery);
    },

    async claimNext() {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const claimed = await client.query<DeliveryRow>(
          `SELECT ${COLUMNS} FROM webhook_deliveries
            WHERE (status = 'queued' AND next_attempt_at <= now())
               OR (status = 'running' AND started_at < now() - interval '10 minutes')
            ORDER BY created_at ASC
            FOR UPDATE SKIP LOCKED
            LIMIT 1`,
        );
        const row = claimed.rows[0];
        if (!row) {
          await client.query("COMMIT");
          return null;
        }
        const updated = await client.query<DeliveryRow>(
          `UPDATE webhook_deliveries
              SET status = 'running', attempts = attempts + 1,
                  started_at = now(), next_attempt_at = NULL
            WHERE id = $1
            RETURNING ${COLUMNS}`,
          [row.id],
        );
        await client.query("COMMIT");
        const next = updated.rows[0];
        return next ? toDelivery(next) : null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async markSucceeded(id, result) {
      const { rows } = await pool.query<DeliveryRow>(
        `UPDATE webhook_deliveries
            SET status = 'succeeded', response_status = $2, response_body = $3,
                error_code = NULL, error_message = NULL, finished_at = now(),
                next_attempt_at = NULL
          WHERE id = $1
          RETURNING ${COLUMNS}`,
        [id, result.status, result.body === null ? null : result.body.slice(0, 64 * 1024)],
      );
      return rows[0] ? toDelivery(rows[0]) : null;
    },

    async markFailed(id, result) {
      const { rows } = await pool.query<DeliveryRow>(
        `UPDATE webhook_deliveries
            SET status = 'failed', response_status = $2, response_body = $3,
                error_code = $4, error_message = $5, finished_at = now(),
                next_attempt_at = NULL
          WHERE id = $1
          RETURNING ${COLUMNS}`,
        [id, ...resultParams(result)],
      );
      return rows[0] ? toDelivery(rows[0]) : null;
    },

    async scheduleRetry(id, nextAttemptAt) {
      const { rows } = await pool.query<DeliveryRow>(
        `UPDATE webhook_deliveries
            SET status = 'queued', next_attempt_at = $2
          WHERE id = $1 AND status = 'running'
          RETURNING ${COLUMNS}`,
        [id, nextAttemptAt],
      );
      return rows[0] ? toDelivery(rows[0]) : null;
    },

    async recordAttempt(deliveryId, input) {
      await pool.query(
        `UPDATE webhook_deliveries
            SET attempts = GREATEST(attempts, $2)
          WHERE id = $1`,
        [deliveryId, input.attempt],
      );
      await pool.query(
        `INSERT INTO webhook_delivery_attempts
           (delivery_id, attempt, status, http_status, error_code, error_message,
            duration_ms, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          deliveryId,
          input.attempt,
          input.status,
          input.httpStatus,
          input.errorCode,
          input.errorMessage === null ? null : input.errorMessage.slice(0, 2000),
          input.durationMs,
          input.startedAt,
          input.finishedAt,
        ],
      );
    },

    async listAttempts(deliveryId) {
      const { rows } = await pool.query<AttemptRow>(
        `SELECT id, delivery_id, attempt, status, http_status, error_code, error_message,
                duration_ms, started_at, finished_at, created_at
           FROM webhook_delivery_attempts
          WHERE delivery_id = $1
          ORDER BY attempt ASC`,
        [deliveryId],
      );
      return rows.map(toAttempt);
    },

    async purgeOlderThan(days) {
      const result = await pool.query(
        `DELETE FROM webhook_deliveries
          WHERE created_at < now() - make_interval(days => $1)`,
        [Math.max(1, Math.min(days, 365))],
      );
      return result.rowCount ?? 0;
    },
  };
}
