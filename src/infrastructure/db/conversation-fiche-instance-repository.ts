import type { Pool } from "pg";
import type {
  ConversationFicheInstanceRepository,
  UpsertFicheInstanceInput,
} from "@/application/ports/conversation-fiche-instance-repository";
import {
  type ConversationFicheInstance,
  type FicheInstanceStatus,
  isFicheInstanceStatus,
  normalizeMissingFields,
} from "@/domain/entities/conversation-fiche-instance";

type Row = {
  id: string;
  organization_id: string;
  conversation_id: string;
  config_id: string;
  fiche_key: string;
  instance_key: string;
  status: string;
  data: unknown;
  missing_fields: string[];
  abandon_reason: string | null;
  detected_at: Date;
  completed_at: Date | null;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, conversation_id, config_id, fiche_key, instance_key, status, data, missing_fields, abandon_reason, detected_at, completed_at, updated_at";

function parseData(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toEntity(row: Row): ConversationFicheInstance {
  const status: FicheInstanceStatus = isFicheInstanceStatus(row.status) ? row.status : "detected";
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    configId: row.config_id,
    ficheKey: row.fiche_key,
    instanceKey: row.instance_key,
    status,
    data: parseData(row.data),
    missingFields: normalizeMissingFields(row.missing_fields),
    abandonReason: row.abandon_reason,
    detectedAt: row.detected_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du registre d'instances de fiches (ADR-0049). */
export function pgConversationFicheInstanceRepository(
  pool: Pool,
): ConversationFicheInstanceRepository {
  return {
    async listByConversation(organizationId, conversationId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM conversation_fiche_instances
          WHERE organization_id = $1 AND conversation_id = $2
          ORDER BY detected_at, fiche_key`,
        [organizationId, conversationId],
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM conversation_fiche_instances
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async upsert(input: UpsertFicheInstanceInput) {
      const instanceKey =
        input.instanceKey?.trim() === "" ? "default" : (input.instanceKey ?? "default");
      const { rows } = await pool.query<Row>(
        `INSERT INTO conversation_fiche_instances
           (organization_id, conversation_id, config_id, fiche_key, instance_key,
            status, data, missing_fields, abandon_reason, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::text[], $9,
                 CASE WHEN $10::boolean THEN now() ELSE NULL END)
         ON CONFLICT (conversation_id, fiche_key, instance_key) DO UPDATE SET
           status = EXCLUDED.status,
           data = conversation_fiche_instances.data || EXCLUDED.data,
           missing_fields = EXCLUDED.missing_fields,
           abandon_reason = EXCLUDED.abandon_reason,
           completed_at = CASE WHEN $10::boolean THEN now() ELSE conversation_fiche_instances.completed_at END,
           updated_at = now()
         RETURNING ${COLUMNS}`,
        [
          input.organizationId,
          input.conversationId,
          input.configId,
          input.ficheKey,
          instanceKey,
          input.status,
          JSON.stringify(input.data ?? {}),
          normalizeMissingFields(input.missingFields),
          input.abandonReason ?? null,
          input.completed === true || input.status === "complete",
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec d'enregistrement de l'instance de fiche");
      return toEntity(row);
    },

    async update(organizationId, id, patch) {
      const { rows } = await pool.query<Row>(
        `UPDATE conversation_fiche_instances SET
           status = COALESCE($3, status),
           data = data || COALESCE($4::jsonb, '{}'::jsonb),
           missing_fields = COALESCE($5::text[], missing_fields),
           abandon_reason = CASE WHEN $6::boolean THEN $7 ELSE abandon_reason END,
           completed_at = CASE
             WHEN $8::boolean THEN now()
             WHEN $9::boolean THEN NULL
             ELSE completed_at
           END,
           updated_at = now()
         WHERE organization_id = $1 AND id = $2
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          id,
          patch.status ?? null,
          patch.data === undefined ? null : JSON.stringify(patch.data),
          patch.missingFields === undefined ? null : normalizeMissingFields(patch.missingFields),
          patch.abandonReason !== undefined,
          patch.abandonReason ?? null,
          patch.completed === true || patch.status === "complete",
          patch.status !== undefined && patch.status !== "complete",
        ],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async activate(organizationId, conversationId, instanceId) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `UPDATE conversation_fiche_instances
              SET status = 'paused', updated_at = now()
            WHERE organization_id = $1 AND conversation_id = $2
              AND status = 'active' AND id <> $3`,
          [organizationId, conversationId, instanceId],
        );
        const { rows } = await client.query<Row>(
          `UPDATE conversation_fiche_instances
              SET status = 'active', updated_at = now()
            WHERE organization_id = $1 AND conversation_id = $2 AND id = $3
            RETURNING ${COLUMNS}`,
          [organizationId, conversationId, instanceId],
        );
        await client.query(
          `UPDATE conversations SET active_fiche_instance_id = $1, updated_at = now()
            WHERE organization_id = $2 AND id = $3`,
          [instanceId, organizationId, conversationId],
        );
        await client.query("COMMIT");
        return rows[0] ? toEntity(rows[0]) : null;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
