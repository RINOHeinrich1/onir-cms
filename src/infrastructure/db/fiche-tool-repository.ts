import type { Pool } from "pg";
import type {
  FicheToolCondition,
  FicheToolLookup,
  FicheToolRepository,
  FicheToolRow,
  FicheToolScope,
  FicheToolSearchCriteria,
  FicheToolSearchResult,
} from "@/application/ports/fiche-tool-repository";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import {
  conversationRotationOffset,
  type FicheStatusMode,
  MAX_SESSION_RESULTS,
} from "@/domain/fiche-search-tool";

type FicheRow = {
  id: string;
  definition: unknown;
  data: unknown;
  qualification_status_key: string | null;
  created_at: Date;
};

type CountRow = { total: number };
type IdRow = { id: string };

function toDefinition(value: unknown): TemplateDefinition | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.key !== "string" || typeof record.renderTemplate !== "string") return null;
  if (!Array.isArray(record.fields)) return null;
  return value as TemplateDefinition;
}

function toData(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function toRow(row: FicheRow): FicheToolRow {
  return {
    id: row.id,
    definition: toDefinition(row.definition),
    data: toData(row.data),
    qualificationStatusKey: row.qualification_status_key,
    createdAt: row.created_at.toISOString(),
  };
}

type AddParam = (value: unknown) => string;

const TYPE_EXPR = "COALESCE(f.fiche_key, f.definition->>'key')";

function buildScopeClauses(
  scope: FicheToolScope & {
    ficheTypes: string[];
    statusMode: FicheStatusMode;
    fixedStatusKeys: string[];
  },
  add: AddParam,
): string[] {
  const clauses: string[] = [];
  clauses.push(`f.organization_id = ${add(scope.organizationId)}`);
  clauses.push("f.archivee = false");

  if (scope.scope === "chat_link") {
    const organization = add(scope.organizationId);
    const link = add(scope.chatLinkId);
    clauses.push(`(
      EXISTS (
        SELECT 1 FROM fiche_chat_links fcl
         WHERE fcl.fiche_id = f.id
           AND fcl.organization_id = ${organization}
           AND fcl.chat_link_id = ${link}
      )
      OR EXISTS (
        SELECT 1 FROM conversations c
         WHERE c.id = f.conversation_id
           AND c.organization_id = ${organization}
           AND c.link_id = ${link}
      )
    )`);
  }

  clauses.push(`${TYPE_EXPR} = ANY(${add(scope.ficheTypes)}::text[])`);

  if (
    (scope.statusMode === "hidden_fixed" || scope.statusMode === "internal_filter") &&
    scope.fixedStatusKeys.length > 0
  ) {
    clauses.push(`f.qualification_status_key = ANY(${add(scope.fixedStatusKeys)}::text[])`);
  }
  return clauses;
}

function textExpression(field: TemplateField, add: AddParam): string {
  return `(f.data ->> ${add(field.name)})`;
}

function buildTextCondition(
  field: TemplateField,
  condition: FicheToolCondition,
  add: AddParam,
): string {
  const value = textExpression(field, add);
  switch (condition.operator) {
    case "eq":
      return `${value} = ${add(condition.value)}`;
    case "neq":
      return `(${value} IS NOT NULL AND ${value} <> ${add(condition.value)})`;
    case "contains": {
      const needle = add(condition.value);
      return `strpos(lower(${value}), lower(${needle})) > 0`;
    }
    case "starts_with": {
      const needle = add(condition.value);
      return `left(lower(${value}), length(${needle})) = lower(${needle})`;
    }
    case "ends_with": {
      const needle = add(condition.value);
      return `right(lower(${value}), length(${needle})) = lower(${needle})`;
    }
    case "in":
      return `${value} = ANY(${add(condition.value)}::text[])`;
    case "not_in":
      return `(${value} IS NOT NULL AND NOT (${value} = ANY(${add(condition.value)}::text[])))`;
    case "exists":
      return `(${value} IS NOT NULL AND btrim(${value}) <> '')`;
    case "is_empty":
      return `(${value} IS NULL OR btrim(${value}) = '')`;
    default:
      return "false";
  }
}

function buildNumberCondition(
  field: TemplateField,
  condition: FicheToolCondition,
  add: AddParam,
): string {
  const fieldParam = add(field.name);
  const raw = `(f.data -> ${fieldParam})`;
  const numeric = `(CASE WHEN jsonb_typeof(${raw}) = 'number' THEN (f.data ->> ${fieldParam})::numeric END)`;
  switch (condition.operator) {
    case "eq":
      return `${numeric} = ${add(condition.value)}::numeric`;
    case "neq":
      return `(${numeric} IS NOT NULL AND ${numeric} <> ${add(condition.value)}::numeric)`;
    case "lt":
      return `${numeric} < ${add(condition.value)}::numeric`;
    case "lte":
      return `${numeric} <= ${add(condition.value)}::numeric`;
    case "gt":
      return `${numeric} > ${add(condition.value)}::numeric`;
    case "gte":
      return `${numeric} >= ${add(condition.value)}::numeric`;
    case "between": {
      const bounds = condition.value as [number, number];
      return `${numeric} BETWEEN ${add(bounds[0])}::numeric AND ${add(bounds[1])}::numeric`;
    }
    case "in":
      return `${numeric} = ANY(${add(condition.value)}::numeric[])`;
    case "exists":
      return `jsonb_typeof(${raw}) = 'number'`;
    default:
      return "false";
  }
}

function buildDateCondition(
  field: TemplateField,
  condition: FicheToolCondition,
  add: AddParam,
): string {
  const value = textExpression(field, add);
  const day = `(CASE WHEN ${value} ~ '^\\d{4}-\\d{2}-\\d{2}' THEN (${value})::date END)`;
  switch (condition.operator) {
    case "eq":
      return `${day} = ${add(condition.value)}::date`;
    case "neq":
      return `(${day} IS NOT NULL AND ${day} <> ${add(condition.value)}::date)`;
    case "lt":
      return `${day} < ${add(condition.value)}::date`;
    case "lte":
      return `${day} <= ${add(condition.value)}::date`;
    case "gt":
      return `${day} > ${add(condition.value)}::date`;
    case "gte":
      return `${day} >= ${add(condition.value)}::date`;
    case "between": {
      const bounds = condition.value as [string, string];
      return `${day} BETWEEN ${add(bounds[0])}::date AND ${add(bounds[1])}::date`;
    }
    case "exists":
      return `(${value} IS NOT NULL AND btrim(${value}) <> '')`;
    default:
      return "false";
  }
}

function buildMultiCondition(
  field: TemplateField,
  condition: FicheToolCondition,
  add: AddParam,
): string {
  const fieldParam = add(field.name);
  const raw = `(f.data -> ${fieldParam})`;
  const array = `(CASE WHEN jsonb_typeof(${raw}) = 'array' THEN ${raw} ELSE '[]'::jsonb END)`;
  const length = `(CASE WHEN jsonb_typeof(${raw}) = 'array' THEN jsonb_array_length(${raw}) ELSE 0 END)`;
  switch (condition.operator) {
    case "contains_any":
      return `EXISTS (SELECT 1 FROM jsonb_array_elements_text(${array}) AS elem WHERE elem = ANY(${add(condition.value)}::text[]))`;
    case "contains_all": {
      const values = condition.value as string[];
      return `(SELECT COUNT(DISTINCT elem) FROM jsonb_array_elements_text(${array}) AS elem WHERE elem = ANY(${add(values)}::text[])) = ${add(values.length)}`;
    }
    case "contains_none":
      return `NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(${array}) AS elem WHERE elem = ANY(${add(condition.value)}::text[]))`;
    case "exists":
      return `${length} > 0`;
    case "is_empty":
      return `(${raw} IS NULL OR ${length} = 0)`;
    default:
      return "false";
  }
}

function buildConditionExpression(
  field: TemplateField,
  condition: FicheToolCondition,
  add: AddParam,
): string {
  switch (field.type) {
    case "number":
      return buildNumberCondition(field, condition, add);
    case "date":
      return buildDateCondition(field, condition, add);
    case "multi":
      return buildMultiCondition(field, condition, add);
    case "file":
      return "false";
    default:
      return buildTextCondition(field, condition, add);
  }
}

function buildConditionGroup(
  condition: FicheToolCondition,
  criteria: Pick<FicheToolSearchCriteria, "ficheTypes" | "definitions">,
  add: AddParam,
): string {
  const parts: string[] = [];
  for (const type of criteria.ficheTypes) {
    const definition = criteria.definitions[type];
    const field = definition?.fields.find((entry) => entry.name === condition.field);
    if (field === undefined) continue;
    const typeParam = add(type);
    parts.push(
      `(${TYPE_EXPR} = ${typeParam} AND ${buildConditionExpression(field, condition, add)})`,
    );
  }
  return parts.length === 0 ? "false" : `(${parts.join(" OR ")})`;
}

type BuiltWhere = { where: string; params: unknown[] };

function buildWhere(
  criteria: Omit<FicheToolSearchCriteria, "sortMode" | "conversationId" | "limit" | "offset">,
): BuiltWhere {
  const params: unknown[] = [];
  const add: AddParam = (value) => {
    params.push(value);
    return `$${params.length}`;
  };

  const clauses = buildScopeClauses(criteria, add);
  if (criteria.query !== null) {
    // Seuls les champs déclarés et non fichier sont interrogeables (ADR-0067 §4.6/§10).
    const searchableFields = new Set<string>();
    for (const type of criteria.ficheTypes) {
      for (const field of criteria.definitions[type]?.fields ?? []) {
        if (field.type !== "file") searchableFields.add(field.name);
      }
    }
    if (searchableFields.size === 0) {
      clauses.push("false");
    } else {
      clauses.push(
        `EXISTS (
          SELECT 1 FROM jsonb_each_text(f.data) AS entry(k, v)
           WHERE entry.k = ANY(${add([...searchableFields])}::text[])
             AND strpos(lower(entry.v), lower(${add(criteria.query)})) > 0
        )`,
      );
    }
  }
  if (criteria.createdFrom !== null) {
    clauses.push(`f.created_at >= ${add(criteria.createdFrom)}::date`);
  }
  if (criteria.createdTo !== null) {
    clauses.push(`f.created_at < (${add(criteria.createdTo)}::date + INTERVAL '1 day')`);
  }
  for (const condition of criteria.conditions) {
    clauses.push(buildConditionGroup(condition, criteria, add));
  }
  return { where: clauses.join(" AND "), params };
}

/** Adapter PostgreSQL du port `FicheToolRepository` (lecture seule). */
export function pgFicheToolRepository(pool: Pool): FicheToolRepository {
  return {
    async searchScoped(criteria: FicheToolSearchCriteria): Promise<FicheToolSearchResult> {
      const { where, params } = buildWhere(criteria);
      const client = await pool.connect();
      try {
        await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
        const counted = await client.query<CountRow>(
          `SELECT count(*)::int AS total FROM fiches f WHERE ${where}`,
          params,
        );
        const total = Number(counted.rows[0]?.total ?? 0);
        if (total === 0) {
          await client.query("COMMIT");
          return { ids: [], total: 0 };
        }

        const queryParams = [...params];
        const addNext: AddParam = (value) => {
          queryParams.push(value);
          return `$${queryParams.length}`;
        };
        const limit = addNext(MAX_SESSION_RESULTS + 1);
        let sql: string;
        if (criteria.sortMode === "fair_rotation") {
          const offset = conversationRotationOffset(criteria.conversationId ?? "", total);
          const offsetParam = addNext(offset);
          const totalParam = addNext(total);
          sql = `WITH ordered AS (
                   SELECT f.id,
                          row_number() OVER (ORDER BY f.created_at ASC, f.id ASC) AS rn
                     FROM fiches f
                    WHERE ${where}
                 )
                 SELECT id
                   FROM ordered
                  ORDER BY mod(rn - 1 + ${offsetParam}::bigint, ${totalParam}::bigint) ASC
                  LIMIT ${limit}`;
        } else if (criteria.sortMode === "created_at") {
          sql = `SELECT f.id
                   FROM fiches f
                  WHERE ${where}
                  ORDER BY f.created_at ASC, f.id ASC
                  LIMIT ${limit}`;
        } else {
          throw new Error("sort_mode_unavailable");
        }

        const { rows } = await client.query<IdRow>(sql, queryParams);
        await client.query("COMMIT");
        return { ids: rows.map((row) => row.id), total };
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async countScoped(criteria): Promise<number> {
      const { where, params } = buildWhere(criteria);
      const { rows } = await pool.query<CountRow>(
        `SELECT count(*)::int AS total FROM fiches f WHERE ${where}`,
        params,
      );
      return Number(rows[0]?.total ?? 0);
    },

    async findScopedById(lookup: FicheToolLookup): Promise<FicheToolRow | null> {
      const params: unknown[] = [];
      const add: AddParam = (value) => {
        params.push(value);
        return `$${params.length}`;
      };
      const clauses = buildScopeClauses(lookup, add);
      clauses.push(`f.id = ${add(lookup.ficheId)}`);
      const { rows } = await pool.query<FicheRow>(
        `SELECT f.id, f.definition, f.data, f.qualification_status_key, f.created_at
           FROM fiches f
          WHERE ${clauses.join(" AND ")}`,
        params,
      );
      const row = rows[0];
      return row ? toRow(row) : null;
    },
  };
}
