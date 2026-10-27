import type { Pool } from "pg";
import type {
  PublicStatisticsRepository,
  StatisticsInterval,
  StatisticsMetric,
  StatisticsRange,
} from "@/application/ports/public-statistics-repository";

const TABLE_BY_METRIC: Record<StatisticsMetric, string> = {
  prospects: "prospects",
  conversations: "conversations",
  fiches: "fiches",
};

const INTERVAL_SQL: Record<StatisticsInterval, string> = {
  day: "day",
  week: "week",
  month: "month",
};

function rangeClause(
  range: StatisticsRange,
  params: unknown[],
  startIndex: number,
  alias = "",
): string {
  const prefix = alias === "" ? "" : `${alias}.`;
  const parts: string[] = [];
  let index = startIndex;
  if (range.from !== null) {
    parts.push(`${prefix}created_at >= $${index}`);
    params.push(range.from);
    index += 1;
  }
  if (range.to !== null) {
    parts.push(`${prefix}created_at <= $${index}`);
    params.push(range.to);
  }
  return parts.length === 0 ? "" : `AND ${parts.join(" AND ")}`;
}

export function pgPublicStatisticsRepository(pool: Pool): PublicStatisticsRepository {
  return {
    async summary(organizationId, range) {
      const params: unknown[] = [organizationId];
      const clause = rangeClause(range, params, 2);
      const [prospects, conversations, fiches] = await Promise.all([
        pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM prospects WHERE organization_id = $1 ${clause}`,
          params,
        ),
        pool.query<{ total: string; active: string; finalised: string }>(
          `SELECT
             count(*)::text AS total,
             count(*) FILTER (WHERE statut = 'en_cours' AND archivee = false)::text AS active,
             count(*) FILTER (WHERE statut = 'finalisee' AND archivee = false)::text AS finalised
           FROM conversations WHERE organization_id = $1 ${clause}`,
          params,
        ),
        pool.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM fiches WHERE organization_id = $1 ${clause}`,
          params,
        ),
      ]);
      return {
        prospects: Number(prospects.rows[0]?.count ?? 0),
        conversations: Number(conversations.rows[0]?.total ?? 0),
        activeConversations: Number(conversations.rows[0]?.active ?? 0),
        finalisedConversations: Number(conversations.rows[0]?.finalised ?? 0),
        fiches: Number(fiches.rows[0]?.count ?? 0),
      };
    },

    async timeseries(organizationId, metric, interval, range) {
      const table = TABLE_BY_METRIC[metric];
      const bucket = INTERVAL_SQL[interval];
      const params: unknown[] = [organizationId];
      const clause = rangeClause(range, params, 2);
      const { rows } = await pool.query<{ bucket: Date; count: string }>(
        `SELECT date_trunc('${bucket}', created_at) AS bucket, count(*)::text AS count
           FROM ${table}
          WHERE organization_id = $1 ${clause}
          GROUP BY bucket
          ORDER BY bucket ASC`,
        params,
      );
      return rows.map((row) => ({
        date: row.bucket.toISOString().slice(0, 10),
        count: Number(row.count),
      }));
    },
  };
}
