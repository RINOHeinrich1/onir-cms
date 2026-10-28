import type { Pool } from "pg";
import type {
  AiProviderModelRepository,
  CreateAiProviderModelInput,
} from "@/application/ports/ai-model-repository";
import type { ReasoningMode } from "@/domain/ai-capabilities";
import {
  type AiModelSource,
  type AiProviderModel,
  parseAiModelSource,
} from "@/domain/entities/ai-model";

type Row = {
  id: string;
  organization_id: string;
  provider_id: string;
  model_id: string;
  label: string;
  source: string;
  enabled: boolean;
  reasoning_mode: string;
  last_seen_at: Date | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, provider_id, model_id, label, source, enabled, reasoning_mode, last_seen_at, created_by, created_at, updated_at";

function toEntity(row: Row): AiProviderModel {
  const source: AiModelSource | null = parseAiModelSource(row.source);
  if (source === null) throw new Error("Source de modèle IA invalide en base");
  return {
    id: row.id,
    organizationId: row.organization_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    label: row.label,
    source,
    enabled: row.enabled,
    reasoningMode:
      row.reasoning_mode === "enabled" || row.reasoning_mode === "disabled"
        ? row.reasoning_mode
        : "auto",
    lastSeenAt: row.last_seen_at === null ? null : row.last_seen_at.toISOString(),
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du catalogue de modèles fournisseur (ADR-0030). */
export function pgAiProviderModelRepository(pool: Pool): AiProviderModelRepository {
  return {
    async list(organizationId, providerId, options = {}) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM ai_provider_models
          WHERE organization_id = $1 AND provider_id = $2
            ${options.enabledOnly === true ? "AND enabled = true" : ""}
          ORDER BY lower(label), model_id`,
        [organizationId, providerId],
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, providerId, id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM ai_provider_models
          WHERE organization_id = $1 AND provider_id = $2 AND id = $3`,
        [organizationId, providerId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async findByModelId(organizationId, providerId, modelId) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM ai_provider_models
          WHERE organization_id = $1 AND provider_id = $2 AND model_id = $3`,
        [organizationId, providerId, modelId],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async create(organizationId, providerId, input: CreateAiProviderModelInput) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO ai_provider_models
          (organization_id, provider_id, model_id, label, source, enabled, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          providerId,
          input.modelId,
          input.label ?? input.modelId,
          input.source,
          input.enabled ?? true,
          input.createdBy,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du modèle IA");
      return toEntity(row);
    },

    async syncCatalog(organizationId, providerId, modelIds) {
      if (modelIds.length > 0) {
        await pool.query(
          `INSERT INTO ai_provider_models
             (organization_id, provider_id, model_id, label, source, enabled, last_seen_at)
           SELECT $1, $2, value, value, 'catalog', true, now()
             FROM unnest($3::text[]) AS value
            WHERE btrim(value) <> ''
           ON CONFLICT (provider_id, model_id) DO UPDATE SET
             last_seen_at = now(),
             updated_at = now()`,
          [organizationId, providerId, modelIds],
        );
      }
      return this.list(organizationId, providerId);
    },

    async setEnabled(organizationId, providerId, id, enabled) {
      const { rows } = await pool.query<Row>(
        `UPDATE ai_provider_models
            SET enabled = $4, updated_at = now()
          WHERE organization_id = $1 AND provider_id = $2 AND id = $3
          RETURNING ${COLUMNS}`,
        [organizationId, providerId, id, enabled],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async setReasoningMode(organizationId, providerId, id, reasoningMode: ReasoningMode) {
      const { rows } = await pool.query<Row>(
        `UPDATE ai_provider_models
            SET reasoning_mode = $4, updated_at = now()
          WHERE organization_id = $1 AND provider_id = $2 AND id = $3
          RETURNING ${COLUMNS}`,
        [organizationId, providerId, id, reasoningMode],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async remove(organizationId, providerId, id) {
      const result = await pool.query(
        `DELETE FROM ai_provider_models
          WHERE organization_id = $1 AND provider_id = $2 AND id = $3`,
        [organizationId, providerId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async countLinksUsing(organizationId, providerId, modelId) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM chat_links
          WHERE organization_id = $1 AND ai_provider_id = $2 AND ai_model = $3`,
        [organizationId, providerId, modelId],
      );
      return Number(rows[0]?.count ?? "0");
    },
  };
}
