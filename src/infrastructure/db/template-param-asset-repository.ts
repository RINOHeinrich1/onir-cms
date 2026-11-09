import type { Pool } from "pg";
import type {
  TemplateParamAsset,
  TemplateParamAssetRepository,
} from "@/application/ports/template-param-asset-repository";

type Row = {
  id: string;
  organization_id: string;
  storage_key: string;
  mime: string;
  size_bytes: number;
  created_at: Date;
};

const COLUMNS = "id, organization_id, storage_key, mime, size_bytes, created_at";

function toEntity(row: Row): TemplateParamAsset {
  return {
    id: row.id,
    organizationId: row.organization_id,
    storageKey: row.storage_key,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  };
}

export function pgTemplateParamAssetRepository(pool: Pool): TemplateParamAssetRepository {
  return {
    async create(organizationId, input) {
      const { rows } = await pool.query<Row>(
        `INSERT INTO template_param_assets
           (organization_id, storage_key, mime, size_bytes, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING ${COLUMNS}`,
        [organizationId, input.storageKey, input.mime, input.sizeBytes, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de l'asset");
      return toEntity(row);
    },
    async findByIdPublic(id) {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM template_param_assets WHERE id = $1`,
        [id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },
    async delete(organizationId, id) {
      const { rows } = await pool.query<Row>(
        `DELETE FROM template_param_assets
          WHERE organization_id = $1 AND id = $2
          RETURNING ${COLUMNS}`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },
  };
}
