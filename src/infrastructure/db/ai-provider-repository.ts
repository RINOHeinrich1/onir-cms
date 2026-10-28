import type { Pool } from "pg";
import type {
  AiProviderRepository,
  AiProviderTestResult,
  CreateAiProviderInput,
  UpdateAiProviderInput,
} from "@/application/ports/ai-provider-repository";
import { parseReasoningProfile } from "@/domain/ai-capabilities";
import {
  type AiDialect,
  type AiProvider,
  type AiProviderPreset,
  parseAiDialect,
  parseAiProviderPreset,
} from "@/domain/entities/ai-provider";
import type { OrganizationAiSettings } from "@/domain/entities/ai-settings";
import type { SealedAiKey } from "@/lib/ai-crypto";

type Row = {
  id: string;
  organization_id: string;
  label: string;
  preset: string;
  dialect: string;
  base_url: string;
  api_key_hint: string;
  default_model: string | null;
  reasoning_profile: string;
  archived_at: Date | null;
  last_test_at: Date | null;
  last_test_ok: boolean | null;
  last_test_error: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, label, preset, dialect, base_url, api_key_hint, default_model, reasoning_profile, archived_at, last_test_at, last_test_ok, last_test_error, created_by, created_at, updated_at";

function toEntity(row: Row): AiProvider {
  const preset: AiProviderPreset | null = parseAiProviderPreset(row.preset);
  const dialect: AiDialect | null = parseAiDialect(row.dialect);
  if (preset === null || dialect === null) {
    throw new Error("Fournisseur IA invalide en base");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    preset,
    dialect,
    baseUrl: row.base_url,
    apiKeyHint: row.api_key_hint,
    defaultModel: row.default_model,
    reasoningProfile: parseReasoningProfile(row.reasoning_profile) ?? "auto",
    archivedAt: row.archived_at === null ? null : row.archived_at.toISOString(),
    lastTestAt: row.last_test_at === null ? null : row.last_test_at.toISOString(),
    lastTestOk: row.last_test_ok,
    lastTestError: row.last_test_error,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function settingsFromRow(row: {
  organization_id: string;
  default_provider_id: string | null;
  default_model: string | null;
  extraction_provider_id: string | null;
  extraction_model: string | null;
  extraction_fallback_provider_id: string | null;
  extraction_fallback_model: string | null;
  updated_at: Date;
}): OrganizationAiSettings {
  return {
    organizationId: row.organization_id,
    defaultProviderId: row.default_provider_id,
    defaultModel: row.default_model,
    extractionProviderId: row.extraction_provider_id,
    extractionModel: row.extraction_model,
    extractionFallbackProviderId: row.extraction_fallback_provider_id,
    extractionFallbackModel: row.extraction_fallback_model,
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `AiProviderRepository` (ADR-0029, ADR-0025). */
export function pgAiProviderRepository(pool: Pool): AiProviderRepository {
  return {
    async list(organizationId, options = {}) {
      const includeArchived = options.includeArchived === true;
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM ai_providers
          WHERE organization_id = $1
            ${includeArchived ? "" : "AND archived_at IS NULL"}
          ORDER BY lower(label)`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM ai_providers WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async create(organizationId, input: CreateAiProviderInput) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO ai_providers
          (organization_id, label, preset, dialect, base_url, api_key_ciphertext,
           api_key_iv, api_key_tag, api_key_hint, default_model, reasoning_profile, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.label,
          input.preset,
          input.dialect,
          input.baseUrl,
          input.sealedKey.ciphertext,
          input.sealedKey.iv,
          input.sealedKey.tag,
          input.apiKeyHint,
          input.defaultModel,
          input.reasoningProfile ?? "auto",
          input.createdBy,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du fournisseur IA");
      return toEntity(row);
    },

    async update(organizationId, id, patch: UpdateAiProviderInput) {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (patch.label !== undefined) push("label", patch.label);
      if (patch.preset !== undefined) push("preset", patch.preset);
      if (patch.dialect !== undefined) push("dialect", patch.dialect);
      if (patch.baseUrl !== undefined) push("base_url", patch.baseUrl);
      if (patch.defaultModel !== undefined) push("default_model", patch.defaultModel);
      if (patch.reasoningProfile !== undefined) push("reasoning_profile", patch.reasoningProfile);
      if (patch.apiKeyHint !== undefined) push("api_key_hint", patch.apiKeyHint);
      if (patch.sealedKey !== undefined) {
        push("api_key_ciphertext", patch.sealedKey.ciphertext);
        push("api_key_iv", patch.sealedKey.iv);
        push("api_key_tag", patch.sealedKey.tag);
      }
      if (sets.length === 0) return this.findById(organizationId, id);

      values.push(organizationId, id);
      const { rows } = await pool.query<Row>(
        `UPDATE ai_providers SET ${sets.join(", ")}, updated_at = now()
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async archive(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `UPDATE ai_providers
            SET archived_at = now(), updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND archived_at IS NULL
          RETURNING ${COLUMNS}`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async getSealedKey(organizationId, id) {
      const { rows } = await pool.query<{
        api_key_ciphertext: string;
        api_key_iv: string;
        api_key_tag: string;
      }>(
        `SELECT api_key_ciphertext, api_key_iv, api_key_tag
           FROM ai_providers WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      if (!row) return null;
      const sealed: SealedAiKey = {
        ciphertext: row.api_key_ciphertext,
        iv: row.api_key_iv,
        tag: row.api_key_tag,
      };
      return sealed;
    },

    async setLastTest(organizationId, id, result: AiProviderTestResult) {
      await pool.query(
        `UPDATE ai_providers
            SET last_test_at = now(), last_test_ok = $3, last_test_error = $4,
                updated_at = now()
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id, result.ok, result.error.slice(0, 500)],
      );
    },

    async countLinksUsing(organizationId, id) {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM chat_links
          WHERE organization_id = $1 AND ai_provider_id = $2`,
        [organizationId, id],
      );
      return Number(rows[0]?.count ?? "0");
    },

    async getOrganizationSettings(organizationId) {
      const { rows } = await pool.query<{
        organization_id: string;
        default_provider_id: string | null;
        default_model: string | null;
        extraction_provider_id: string | null;
        extraction_model: string | null;
        extraction_fallback_provider_id: string | null;
        extraction_fallback_model: string | null;
        updated_at: Date;
      }>(
        `SELECT organization_id, default_provider_id, default_model,
                extraction_provider_id, extraction_model,
                extraction_fallback_provider_id, extraction_fallback_model, updated_at
           FROM organization_ai_settings WHERE organization_id = $1`,
        [organizationId],
      );
      return rows[0] ? settingsFromRow(rows[0]) : null;
    },

    async setOrganizationDefault(organizationId, input) {
      if (input.providerId === null || input.model === null) {
        const { rows: extraction } = await pool.query<{ has_extraction: boolean }>(
          `SELECT (extraction_provider_id IS NOT NULL OR extraction_fallback_provider_id IS NOT NULL) AS has_extraction
             FROM organization_ai_settings WHERE organization_id = $1`,
          [organizationId],
        );
        if (extraction[0]?.has_extraction !== true) {
          await pool.query("DELETE FROM organization_ai_settings WHERE organization_id = $1", [
            organizationId,
          ]);
          return null;
        }
      }
      const { rows } = await pool.query<{
        organization_id: string;
        default_provider_id: string | null;
        default_model: string | null;
        extraction_provider_id: string | null;
        extraction_model: string | null;
        extraction_fallback_provider_id: string | null;
        extraction_fallback_model: string | null;
        updated_at: Date;
      }>(
        `INSERT INTO organization_ai_settings
           (organization_id, default_provider_id, default_model, updated_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (organization_id) DO UPDATE SET
           default_provider_id = EXCLUDED.default_provider_id,
           default_model = EXCLUDED.default_model,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING organization_id, default_provider_id, default_model,
                   extraction_provider_id, extraction_model,
                   extraction_fallback_provider_id, extraction_fallback_model, updated_at`,
        [organizationId, input.providerId, input.model, input.updatedBy],
      );
      const row = rows[0];
      return row ? settingsFromRow(row) : null;
    },

    async setOrganizationExtraction(organizationId, input) {
      const { rows } = await pool.query<{
        organization_id: string;
        default_provider_id: string | null;
        default_model: string | null;
        extraction_provider_id: string | null;
        extraction_model: string | null;
        extraction_fallback_provider_id: string | null;
        extraction_fallback_model: string | null;
        updated_at: Date;
      }>(
        `INSERT INTO organization_ai_settings
           (organization_id, extraction_provider_id, extraction_model,
            extraction_fallback_provider_id, extraction_fallback_model, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (organization_id) DO UPDATE SET
           extraction_provider_id = EXCLUDED.extraction_provider_id,
           extraction_model = EXCLUDED.extraction_model,
           extraction_fallback_provider_id = EXCLUDED.extraction_fallback_provider_id,
           extraction_fallback_model = EXCLUDED.extraction_fallback_model,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING organization_id, default_provider_id, default_model,
                   extraction_provider_id, extraction_model,
                   extraction_fallback_provider_id, extraction_fallback_model, updated_at`,
        [
          organizationId,
          input.providerId,
          input.model,
          input.fallbackProviderId,
          input.fallbackModel,
          input.updatedBy,
        ],
      );
      const row = rows[0];
      return row ? settingsFromRow(row) : null;
    },
  };
}
