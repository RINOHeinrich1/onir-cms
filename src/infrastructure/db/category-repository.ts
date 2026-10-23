import type { Pool, PoolClient } from "pg";
import { NotFoundError, ValidationError } from "@/application/errors";
import type {
  CategoryContentType,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/application/ports/category-repository";
import type { Category } from "@/domain/entities/category";

type CategoryRow = {
  id: string;
  organization_id: string;
  label: string;
  slug: string;
  description: string;
  actif: boolean;
  position: number;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

const COLUMNS =
  "id, organization_id, label, slug, description, actif, position, created_by, created_at, updated_at";

const CONTENT = {
  media: { table: "medias", column: "media_id", assoc: "media_categories" },
  connaissance: {
    table: "base_connaissances",
    column: "connaissance_id",
    assoc: "connaissance_categories",
  },
  link: { table: "chat_links", column: "link_id", assoc: "link_categories" },
} as const;

function toEntity(row: CategoryRow): Category {
  return {
    id: row.id,
    organizationId: row.organization_id,
    label: row.label,
    slug: row.slug,
    description: row.description,
    actif: row.actif,
    position: row.position,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

async function listForContentWith(
  client: Pool | PoolClient,
  organizationId: string,
  contentType: CategoryContentType,
  contentId: string,
): Promise<Category[]> {
  const config = CONTENT[contentType];
  const { rows } = await client.query<CategoryRow>(
    `SELECT c.id, c.organization_id, c.label, c.slug, c.description, c.actif,
            c.position, c.created_by, c.created_at, c.updated_at
       FROM ${config.assoc} a
       JOIN categories c ON c.id = a.category_id
      WHERE a.${config.column} = $1
        AND c.organization_id = $2
      ORDER BY c.actif DESC, c.position, lower(c.label)`,
    [contentId, organizationId],
  );
  return rows.map(toEntity);
}

/** Adapter PostgreSQL du port `CategoryRepository` (ADR-0027). */
export function pgCategoryRepository(pool: Pool): CategoryRepository {
  return {
    async list(organizationId): Promise<Category[]> {
      const { rows } = await pool.query<CategoryRow>(
        `SELECT ${COLUMNS} FROM categories
          WHERE organization_id = $1
          ORDER BY actif DESC, position, lower(label)`,
        [organizationId],
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id): Promise<Category | null> {
      const { rows } = await pool.query<CategoryRow>(
        `SELECT ${COLUMNS} FROM categories WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async findByLabel(organizationId, label): Promise<Category | null> {
      const { rows } = await pool.query<CategoryRow>(
        `SELECT ${COLUMNS} FROM categories
          WHERE organization_id = $1 AND lower(label) = lower($2)`,
        [organizationId, label],
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async create(organizationId, input: CreateCategoryInput): Promise<Category> {
      const { rows } = await pool.query<CategoryRow>(
        `INSERT INTO categories
           (organization_id, label, slug, description, actif, position, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING ${COLUMNS}`,
        [
          organizationId,
          input.label,
          input.slug,
          input.description,
          input.actif,
          input.position,
          input.createdBy,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création de la catégorie");
      return toEntity(row);
    },

    async update(organizationId, id, patch: UpdateCategoryInput): Promise<Category | null> {
      const sets: string[] = [];
      const values: unknown[] = [];
      const push = (column: string, value: unknown): void => {
        values.push(value);
        sets.push(`${column} = $${values.length}`);
      };
      if (patch.label !== undefined) push("label", patch.label);
      if (patch.slug !== undefined) push("slug", patch.slug);
      if (patch.description !== undefined) push("description", patch.description);
      if (patch.actif !== undefined) push("actif", patch.actif);
      if (patch.position !== undefined) push("position", patch.position);
      if (sets.length === 0) {
        return this.findById(organizationId, id);
      }
      push("updated_at", new Date());
      values.push(organizationId, id);
      const { rows } = await pool.query<CategoryRow>(
        `UPDATE categories SET ${sets.join(", ")}
          WHERE organization_id = $${values.length - 1} AND id = $${values.length}
          RETURNING ${COLUMNS}`,
        values,
      );
      const row = rows[0];
      return row ? toEntity(row) : null;
    },

    async delete(organizationId, id): Promise<boolean> {
      const result = await pool.query(
        "DELETE FROM categories WHERE organization_id = $1 AND id = $2",
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },

    async listForContent(organizationId, contentType, contentId): Promise<Category[]> {
      return listForContentWith(pool, organizationId, contentType, contentId);
    },

    async setForContent(organizationId, contentType, contentId, categoryIds): Promise<Category[]> {
      const config = CONTENT[contentType];
      const ids = [...new Set(categoryIds)];
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const content = await client.query(
          `SELECT 1 FROM ${config.table} WHERE organization_id = $1 AND id = $2`,
          [organizationId, contentId],
        );
        if ((content.rowCount ?? 0) === 0) throw new NotFoundError("Contenu introuvable");

        if (ids.length > 0) {
          const found = await client.query<{ id: string }>(
            `SELECT id FROM categories
              WHERE organization_id = $1 AND id = ANY($2::uuid[])`,
            [organizationId, ids],
          );
          if ((found.rowCount ?? 0) !== ids.length) {
            throw new ValidationError("Catégorie inconnue");
          }
        }

        await client.query(`DELETE FROM ${config.assoc} WHERE ${config.column} = $1`, [contentId]);
        if (ids.length > 0) {
          await client.query(
            `INSERT INTO ${config.assoc} (${config.column}, category_id)
             SELECT $1, unnest($2::uuid[])`,
            [contentId, ids],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
      return listForContentWith(pool, organizationId, contentType, contentId);
    },
  };
}
