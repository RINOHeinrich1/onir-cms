import type { Pool } from "pg";
import type {
  CreateTemplateDataBindingInput,
  DefaultBindingQuery,
  EffectiveBindingQuery,
  SaveTemplateDataBindingInput,
  TemplateDataBindingRepository,
  UpdateTemplateDataBindingInput,
} from "@/application/ports/template-data-binding-repository";
import type {
  TemplateDataBinding,
  TemplateDataChildQuery,
  TemplateDataInvalidation,
  TemplateDataQueryInput,
} from "@/domain/template-data";

type Row = {
  id: string;
  name: string;
  is_default: boolean;
  organization_id: string;
  template_version_id: string;
  contract_key: string;
  provider: "sql";
  query_text: string;
  root_path: string;
  root_key: string;
  children: unknown;
  query_inputs: unknown;
  invalidate_on: TemplateDataInvalidation;
  cache_ttl_seconds: number;
  max_rows: number;
  enabled: boolean;
  revision: number;
};

const COLUMN_LIST = [
  "id",
  "name",
  "is_default",
  "organization_id",
  "template_version_id",
  "contract_key",
  "provider",
  "query_text",
  "root_path",
  "root_key",
  "children",
  "query_inputs",
  "invalidate_on",
  "cache_ttl_seconds",
  "max_rows",
  "enabled",
  "revision",
];
const COLUMNS = COLUMN_LIST.join(", ");
const LINKED_COLUMNS = COLUMN_LIST.map((column) => `b.${column}`).join(", ");

function toChildren(value: unknown): TemplateDataChildQuery[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object",
    )
    .map((entry) => ({
      path: typeof entry.path === "string" ? entry.path : "",
      queryText:
        typeof entry.query_text === "string"
          ? entry.query_text
          : typeof entry.queryText === "string"
            ? entry.queryText
            : "",
      foreignKey:
        typeof entry.foreign_key === "string"
          ? entry.foreign_key
          : typeof entry.foreignKey === "string"
            ? entry.foreignKey
            : "",
    }));
}

/** Forme persistée canonique (snake_case), alignée sur `toChildren`. */
function storedChildren(children: TemplateDataChildQuery[]): Record<string, unknown>[] {
  return children.map((child) => ({
    path: child.path,
    query_text: child.queryText,
    foreign_key: child.foreignKey,
  }));
}

function toQueryInputs(value: unknown): TemplateDataQueryInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object",
    )
    .map((entry) => ({
      index: typeof entry.index === "number" ? entry.index : 0,
      from: typeof entry.from === "string" ? entry.from : "",
    }));
}

function toBinding(row: Row): TemplateDataBinding {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.is_default,
    organizationId: row.organization_id,
    templateVersionId: row.template_version_id,
    contractKey: row.contract_key,
    provider: row.provider,
    queryText: row.query_text,
    rootPath: row.root_path,
    rootKey: row.root_key,
    children: toChildren(row.children),
    queryInputs: toQueryInputs(row.query_inputs),
    invalidateOn: row.invalidate_on,
    cacheTtlSeconds: row.cache_ttl_seconds,
    maxRows: row.max_rows,
    enabled: row.enabled,
    revision: row.revision,
  };
}

export function pgTemplateDataBindingRepository(pool: Pool): TemplateDataBindingRepository {
  return {
    async findEffective(query: EffectiveBindingQuery): Promise<TemplateDataBinding | null> {
      if (query.linkId !== null) {
        const override = await pool.query<Row>(
          `SELECT ${LINKED_COLUMNS}
             FROM chat_link_data_bindings l
             JOIN template_data_bindings b ON b.id = l.binding_id
            WHERE l.chat_link_id = $1 AND l.contract_key = $2
            LIMIT 1`,
          [query.linkId, query.contractKey],
        );
        if (override.rows[0]) return toBinding(override.rows[0]);
      }
      const fallback = await pool.query<Row>(
        `SELECT ${COLUMNS}
           FROM template_data_bindings
          WHERE organization_id = $1 AND template_version_id = $2 AND contract_key = $3
            AND is_default
          LIMIT 1`,
        [query.organizationId, query.templateVersionId, query.contractKey],
      );
      return fallback.rows[0] ? toBinding(fallback.rows[0]) : null;
    },

    async listForVersion(
      organizationId: string,
      templateVersionId: string,
    ): Promise<TemplateDataBinding[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS}
           FROM template_data_bindings
          WHERE organization_id = $1 AND template_version_id = $2
          ORDER BY contract_key, is_default DESC, lower(name)`,
        [organizationId, templateVersionId],
      );
      return rows.map(toBinding);
    },

    async findById(organizationId: string, id: string): Promise<TemplateDataBinding | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS} FROM template_data_bindings
          WHERE id = $1 AND organization_id = $2`,
        [id, organizationId],
      );
      return rows[0] ? toBinding(rows[0]) : null;
    },

    async create(input: CreateTemplateDataBindingInput): Promise<TemplateDataBinding> {
      const { rows } = await pool.query<Row>(
        `INSERT INTO template_data_bindings
           (organization_id, template_version_id, contract_key, name, query_text, root_path,
            root_key, children, query_inputs, invalidate_on, cache_ttl_seconds, max_rows,
            enabled, is_default, created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11, $12, $13, false, $14, $14)
         RETURNING ${COLUMNS}`,
        [
          input.organizationId,
          input.templateVersionId,
          input.contractKey,
          input.name,
          input.queryText,
          input.rootPath,
          input.rootKey,
          JSON.stringify(storedChildren(input.children)),
          JSON.stringify(input.queryInputs),
          input.invalidateOn,
          input.cacheTtlSeconds,
          input.maxRows,
          input.enabled,
          input.actorId,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Variante de données non enregistrée");
      return toBinding(row);
    },

    async updateById(
      organizationId: string,
      id: string,
      input: UpdateTemplateDataBindingInput,
    ): Promise<TemplateDataBinding | null> {
      const { rows } = await pool.query<Row>(
        `UPDATE template_data_bindings SET
           name = $3,
           query_text = $4,
           root_path = $5,
           root_key = $6,
           children = $7::jsonb,
           query_inputs = $8::jsonb,
           invalidate_on = $9,
           cache_ttl_seconds = $10,
           max_rows = $11,
           enabled = $12,
           revision = revision + 1,
           updated_by = $13,
           updated_at = now()
         WHERE id = $1 AND organization_id = $2
         RETURNING ${COLUMNS}`,
        [
          id,
          organizationId,
          input.name,
          input.queryText,
          input.rootPath,
          input.rootKey,
          JSON.stringify(storedChildren(input.children)),
          JSON.stringify(input.queryInputs),
          input.invalidateOn,
          input.cacheTtlSeconds,
          input.maxRows,
          input.enabled,
          input.actorId,
        ],
      );
      return rows[0] ? toBinding(rows[0]) : null;
    },

    async setDefault(organizationId: string, id: string): Promise<TemplateDataBinding | null> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<Row>(
          `SELECT ${COLUMNS} FROM template_data_bindings
            WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [id, organizationId],
        );
        const target = current.rows[0];
        if (!target) {
          await client.query("ROLLBACK");
          return null;
        }
        await client.query(
          `UPDATE template_data_bindings
              SET is_default = false, revision = revision + 1
            WHERE organization_id = $1 AND template_version_id = $2
              AND contract_key = $3 AND is_default AND id <> $4`,
          [organizationId, target.template_version_id, target.contract_key, id],
        );
        const updated = await client.query<Row>(
          `UPDATE template_data_bindings
              SET is_default = true, revision = revision + 1, updated_at = now()
            WHERE id = $1 AND organization_id = $2
            RETURNING ${COLUMNS}`,
          [id, organizationId],
        );
        await client.query("COMMIT");
        return updated.rows[0] ? toBinding(updated.rows[0]) : null;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async deleteWithPromotion(
      organizationId: string,
      id: string,
    ): Promise<{ deleted: boolean; promotedId: string | null }> {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const current = await client.query<Row>(
          `SELECT ${COLUMNS} FROM template_data_bindings
            WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
          [id, organizationId],
        );
        const target = current.rows[0];
        if (!target) {
          await client.query("ROLLBACK");
          return { deleted: false, promotedId: null };
        }
        await client.query(
          "DELETE FROM template_data_bindings WHERE id = $1 AND organization_id = $2",
          [id, organizationId],
        );
        let promotedId: string | null = null;
        if (target.is_default) {
          const next = await client.query<{ id: string }>(
            `SELECT id FROM template_data_bindings
              WHERE organization_id = $1 AND template_version_id = $2 AND contract_key = $3
              ORDER BY enabled DESC, lower(name)
              LIMIT 1
              FOR UPDATE`,
            [organizationId, target.template_version_id, target.contract_key],
          );
          const candidate = next.rows[0]?.id;
          if (candidate !== undefined) {
            await client.query(
              `UPDATE template_data_bindings
                  SET is_default = true, revision = revision + 1, updated_at = now()
                WHERE id = $1`,
              [candidate],
            );
            promotedId = candidate;
          }
        }
        await client.query("COMMIT");
        return { deleted: true, promotedId };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },

    async countLinkUsages(id: string): Promise<number> {
      const { rows } = await pool.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM chat_link_data_bindings WHERE binding_id = $1",
        [id],
      );
      return rows[0]?.count ?? 0;
    },

    async findDefault(query: DefaultBindingQuery): Promise<TemplateDataBinding | null> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS}
           FROM template_data_bindings
          WHERE organization_id = $1 AND template_version_id = $2 AND contract_key = $3
            AND is_default
          LIMIT 1`,
        [query.organizationId, query.templateVersionId, query.contractKey],
      );
      return rows[0] ? toBinding(rows[0]) : null;
    },

    async listDefaults(
      organizationId: string,
      templateVersionId: string,
    ): Promise<TemplateDataBinding[]> {
      const { rows } = await pool.query<Row>(
        `SELECT ${COLUMNS}
           FROM template_data_bindings
          WHERE organization_id = $1 AND template_version_id = $2 AND is_default
          ORDER BY contract_key`,
        [organizationId, templateVersionId],
      );
      return rows.map(toBinding);
    },

    async upsertDefault(input: SaveTemplateDataBindingInput): Promise<TemplateDataBinding> {
      const { rows } = await pool.query<Row>(
        `INSERT INTO template_data_bindings
           (organization_id, template_version_id, contract_key, query_text, root_path, root_key,
            children, query_inputs, invalidate_on, cache_ttl_seconds, max_rows, enabled, is_default,
            created_by, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, true, $13, $13)
         ON CONFLICT (organization_id, template_version_id, contract_key) WHERE is_default
         DO UPDATE SET
           query_text = EXCLUDED.query_text,
           root_path = EXCLUDED.root_path,
           root_key = EXCLUDED.root_key,
           children = EXCLUDED.children,
           query_inputs = EXCLUDED.query_inputs,
           invalidate_on = EXCLUDED.invalidate_on,
           cache_ttl_seconds = EXCLUDED.cache_ttl_seconds,
           max_rows = EXCLUDED.max_rows,
           enabled = EXCLUDED.enabled,
           revision = template_data_bindings.revision + 1,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()
         RETURNING ${COLUMNS}`,
        [
          input.organizationId,
          input.templateVersionId,
          input.contractKey,
          input.queryText,
          input.rootPath,
          input.rootKey,
          JSON.stringify(storedChildren(input.children)),
          JSON.stringify(input.queryInputs),
          input.invalidateOn,
          input.cacheTtlSeconds,
          input.maxRows,
          input.enabled,
          input.actorId,
        ],
      );
      const row = rows[0];
      if (!row) throw new Error("Binding de données non enregistré");
      return toBinding(row);
    },
  };
}
