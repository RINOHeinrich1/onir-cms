import type { Pool } from "pg";
import type {
  CreateMediaInput,
  MediaRepository,
  UpdateMediaInput,
} from "@/application/ports/media-repository";
import { isTypeMedia, type Media, type TypeMedia } from "@/domain/entities/media";

type MediaRow = {
  id: string;
  organization_id: string;
  type: string;
  libelle: string;
  description: string;
  template_keys: string[];
  actif: boolean;
  fichier: string | null;
  mime: string | null;
  url: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, type, libelle, description, template_keys, actif, fichier, mime, url, created_by, created_at, updated_at";

function toEntity(row: MediaRow): Media {
  if (!isTypeMedia(row.type)) {
    throw new Error(`Type de média inconnu : ${row.type}`);
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    type: row.type,
    libelle: row.libelle,
    description: row.description,
    templateKeys: row.template_keys,
    actif: row.actif,
    fichier: row.fichier,
    mime: row.mime,
    url: row.url,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** Adapter PostgreSQL du port `MediaRepository` (scopé ADR-0025). */
export function pgMediaRepository(pool: Pool): MediaRepository {
  return {
    async findById(organizationId, id): Promise<Media | null> {
      const { rows } = await pool.query<MediaRow>(
        `SELECT ${COLUMNS} FROM medias WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByIdPublic(id): Promise<Media | null> {
      const { rows } = await pool.query<MediaRow>(`SELECT ${COLUMNS} FROM medias WHERE id = $1`, [
        id,
      ]);
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByLibelle(organizationId, type: TypeMedia, libelle): Promise<Media | null> {
      const { rows } = await pool.query<MediaRow>(
        `SELECT ${COLUMNS} FROM medias
          WHERE organization_id = $1 AND type = $2 AND lower(libelle) = lower($3)`,
        [organizationId, type, libelle],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async list(organizationId): Promise<Media[]> {
      const { rows } = await pool.query<MediaRow>(
        `SELECT ${COLUMNS} FROM medias
          WHERE organization_id = $1
          ORDER BY updated_at DESC`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async listActivesByType(organizationId, type, templateKey): Promise<Media[]> {
      const { rows } = await pool.query<MediaRow>(
        `SELECT ${COLUMNS} FROM medias
         WHERE organization_id = $1 AND actif AND type = $2
           AND (cardinality(template_keys) = 0 OR $3 = ANY(template_keys))
         ORDER BY updated_at DESC`,
        [organizationId, type, templateKey],
      );
      return rows.map(toEntity);
    },

    async listActivesByTypeForChatLink(organizationId, type, chatLinkId): Promise<Media[]> {
      const { rows } = await pool.query<MediaRow>(
        `SELECT ${COLUMNS} FROM medias
         WHERE organization_id = $1 AND actif AND type = $2
           AND (cardinality(template_keys) = 0 OR chat_link_ids @> ARRAY[$3]::uuid[])
         ORDER BY updated_at DESC`,
        [organizationId, type, chatLinkId],
      );
      return rows.map(toEntity);
    },

    async create(organizationId, input: CreateMediaInput): Promise<Media> {
      const { rows } = await pool.query<MediaRow>(
        `INSERT INTO medias (organization_id, type, libelle, description, template_keys, actif, fichier, mime, url, created_by)
         VALUES ($1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.type,
          input.libelle,
          input.description,
          input.templateKeys,
          input.actif,
          input.fichier,
          input.mime,
          input.url,
          input.createdBy,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du média");
      return toEntity(row);
    },

    async update(organizationId, id, patch: UpdateMediaInput): Promise<Media | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };

      if (patch.libelle !== undefined) push("libelle", patch.libelle);
      if (patch.description !== undefined) push("description", patch.description);
      if (patch.templateKeys !== undefined) push("template_keys", patch.templateKeys);
      if (patch.actif !== undefined) push("actif", patch.actif);
      if (patch.url !== undefined) push("url", patch.url);

      if (sets.length === 0) {
        return this.findById(organizationId, id);
      }

      push("updated_at", new Date());
      values.push(organizationId, id);
      const { rows } = await pool.query<MediaRow>(
        `UPDATE medias SET ${sets.join(", ")}
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query("DELETE FROM medias WHERE organization_id = $1 AND id = $2", [
        organizationId,
        id,
      ]);
      return (result.rowCount ?? 0) > 0;
    },
  };
}
