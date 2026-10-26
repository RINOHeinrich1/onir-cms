import type { Pool } from "pg";
import type {
  ApiKeyRepository,
  CreateApiKeyRecordInput,
} from "@/application/ports/api-key-repository";
import type { ApiKey, ApiKeyScope, ApiKeyWithHash } from "@/domain/entities/api-key";

type ApiKeyRow = {
  id: string;
  organization_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: string[];
  created_by: string | null;
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  last_used_ip: string | null;
};

const COLUMNS =
  "id, organization_id, name, key_prefix, key_hash, scopes, created_by, created_at, expires_at, revoked_at, last_used_at, last_used_ip";

function toApiKey(row: ApiKeyRow): ApiKey {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    keyPrefix: row.key_prefix,
    scopes: row.scopes as ApiKeyScope[],
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    expiresAt: row.expires_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    lastUsedAt: row.last_used_at?.toISOString() ?? null,
    lastUsedIp: row.last_used_ip,
  };
}

function toApiKeyWithHash(row: ApiKeyRow): ApiKeyWithHash {
  return { ...toApiKey(row), keyHash: row.key_hash };
}

/** Adapter PostgreSQL des clés d'API (hash uniquement, portée organisation). */
export function pgApiKeyRepository(pool: Pool): ApiKeyRepository {
  return {
    async list(organizationId) {
      const { rows } = await pool.query<ApiKeyRow>(
        `SELECT ${COLUMNS} FROM api_keys
          WHERE organization_id = $1
          ORDER BY created_at DESC`,
        [organizationId],
      );
      return rows.map(toApiKey);
    },

    async create(organizationId, input: CreateApiKeyRecordInput) {
      const { rows } = await pool.query<ApiKeyRow>(
        `INSERT INTO api_keys
           (organization_id, name, key_prefix, key_hash, scopes, created_by, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.name,
          input.keyPrefix,
          input.keyHash,
          input.scopes,
          input.createdBy,
          input.expiresAt,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la clé d’API");
      return toApiKey(row);
    },

    async revoke(organizationId, id) {
      const { rows } = await pool.query<ApiKeyRow>(
        `UPDATE api_keys SET revoked_at = now()
          WHERE organization_id = $1 AND id = $2 AND revoked_at IS NULL
          RETURNING ${COLUMNS}`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toApiKey(row) : null;
    },

    async findByPrefix(keyPrefix) {
      const { rows } = await pool.query<ApiKeyRow>(
        `SELECT ${COLUMNS} FROM api_keys WHERE key_prefix = $1 LIMIT 1`,
        [keyPrefix],
      );
      const row = rows[0];
      return row ? toApiKeyWithHash(row) : null;
    },

    async touchLastUsed(id, ip) {
      await pool.query(
        `UPDATE api_keys
            SET last_used_at = now(), last_used_ip = $2
          WHERE id = $1
            AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
        [id, ip],
      );
    },
  };
}
