/**
 * Fournisseur SQL des ressources de données (ADR-0026 §4).
 *
 * Exécution dans une **transaction READ ONLY**, sous le rôle `template_reader`,
 * `search_path` figé sur `template_read`, `app.organization_id` posé en local,
 * timeout/plafonds, puis `ROLLBACK`. Aucune écriture possible ; les vues
 * org-scopées portent le filtrage tenant.
 */
import { Pool, type PoolClient } from "pg";
import {
  TemplateQueryError,
  type TemplateQueryErrorCode,
  type TemplateQueryExecutor,
  type TemplateQueryInput,
  type TemplateQueryResult,
} from "@/application/ports/template-query-executor";

export const TEMPLATE_QUERY_LIMITS = {
  maxSqlBytes: 8192,
  defaultRows: 200,
  maxRows: 1000,
  defaultTimeoutMs: 2000,
  maxTimeoutMs: 10000,
  defaultBytes: 1024 * 1024,
  maxBytes: 2 * 1024 * 1024,
  readerRole: "template_reader",
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Valide la requête avant toute connexion : une seuleinstruction SELECT/WITH. */
export function assertReadOnlyQuery(sql: string): void {
  const text = typeof sql === "string" ? sql.trim() : "";
  if (text === "") {
    throw new TemplateQueryError("DATA_PROVIDER_ERROR", "Requête vide");
  }
  if (Buffer.byteLength(text, "utf8") > TEMPLATE_QUERY_LIMITS.maxSqlBytes) {
    throw new TemplateQueryError("DATA_PROVIDER_ERROR", "Requête trop longue");
  }
  if (text.includes(";")) {
    throw new TemplateQueryError("DATA_PROVIDER_ERROR", "Une seule instruction est autorisée");
  }
  if (text.includes("--") || text.includes("/*") || text.includes("\u0000")) {
    throw new TemplateQueryError("DATA_PROVIDER_ERROR", "Commentaires et octets nuls interdits");
  }
  if (!/^(select|with)\b/i.test(text)) {
    throw new TemplateQueryError("DATA_PROVIDER_ERROR", "SELECT ou WITH attendu");
  }
}

function clampInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const candidate = value === undefined || !Number.isFinite(value) ? fallback : Math.trunc(value);
  return Math.min(max, Math.max(min, candidate));
}

function toTemplateQueryError(error: unknown): TemplateQueryError {
  if (error instanceof TemplateQueryError) return error;
  const code = (error as { code?: string } | null)?.code;
  const map: Record<string, TemplateQueryErrorCode> = {
    "57014": "DATA_TIMEOUT",
    "42501": "DATA_UNAUTHORIZED",
    "25006": "DATA_UNAUTHORIZED",
    "22P02": "DATA_INPUT_INVALID",
    "22003": "DATA_INPUT_INVALID",
    "22007": "DATA_INPUT_INVALID",
  };
  const rawMessage = (error as { message?: unknown } | null)?.message;
  const detail = typeof rawMessage === "string" ? rawMessage : undefined;
  return new TemplateQueryError(
    map[code ?? ""] ?? "DATA_PROVIDER_ERROR",
    "Échec du fournisseur de données",
    detail,
  );
}

type ExecutorOptions = {
  /** Connexion dédiée au rôle de lecture (sinon `TEMPLATE_DATABASE_URL`). */
  connectionString?: string;
  /** Pool injecté (tests) — prioritaire sur `connectionString`. */
  pool?: Pool;
};

export type TemplateQueryExecutorHandle = TemplateQueryExecutor & {
  close(): Promise<void>;
};

/** Construit l'exécuteur ; refuse de démarrer sans connexion (fail-closed). */
export function createTemplateQueryExecutor(
  options: ExecutorOptions = {},
): TemplateQueryExecutorHandle {
  const connectionString = options.connectionString ?? process.env.TEMPLATE_DATABASE_URL;
  const ownPool = options.pool === undefined;
  if (
    options.pool === undefined &&
    (connectionString === undefined || connectionString.trim() === "")
  ) {
    throw new TemplateQueryError(
      "DATA_PROVIDER_ERROR",
      "Fournisseur de données non configuré (TEMPLATE_DATABASE_URL)",
    );
  }
  const pool =
    options.pool ??
    new Pool({
      connectionString,
      max: 4,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
      application_name: "onirtech-template-read",
    });

  async function execute(input: TemplateQueryInput): Promise<TemplateQueryResult> {
    assertReadOnlyQuery(input.sql);
    if (!UUID.test(input.organizationId)) {
      throw new TemplateQueryError("DATA_INPUT_INVALID", "Organisation invalide");
    }
    const maxRows = clampInteger(
      input.maxRows,
      TEMPLATE_QUERY_LIMITS.defaultRows,
      1,
      TEMPLATE_QUERY_LIMITS.maxRows,
    );
    const timeoutMs = clampInteger(
      input.timeoutMs,
      TEMPLATE_QUERY_LIMITS.defaultTimeoutMs,
      1,
      TEMPLATE_QUERY_LIMITS.maxTimeoutMs,
    );
    const maxBytes = clampInteger(
      input.maxBytes,
      TEMPLATE_QUERY_LIMITS.defaultBytes,
      1024,
      TEMPLATE_QUERY_LIMITS.maxBytes,
    );
    const started = performance.now();

    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      await client.query("BEGIN READ ONLY");
      await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
      await client.query(`SET LOCAL idle_in_transaction_session_timeout = ${timeoutMs}`);
      await client.query(`SET LOCAL ROLE ${TEMPLATE_QUERY_LIMITS.readerRole}`);
      await client.query("SET LOCAL search_path = template_read, pg_catalog");
      await client.query("SELECT set_config('app.organization_id', $1, true)", [
        input.organizationId,
      ]);

      const wrapped = `SELECT * FROM (${input.sql}) AS template_query LIMIT ${maxRows + 1}`;
      const result = await client.query({ text: wrapped, values: [...(input.params ?? [])] });
      await client.query("ROLLBACK");

      const truncated = result.rows.length > maxRows;
      const rows = (truncated ? result.rows.slice(0, maxRows) : result.rows) as Record<
        string,
        unknown
      >[];
      const byteCount = Buffer.byteLength(JSON.stringify(rows), "utf8");
      if (byteCount > maxBytes) {
        throw new TemplateQueryError("DATA_LIMIT", "Résultat trop volumineux");
      }
      return {
        rows,
        truncated,
        durationMs: Math.round(performance.now() - started),
        byteCount,
      };
    } catch (error) {
      if (client) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // Transaction déjà terminée (timeout, erreur serveur) : rien à faire.
        }
      }
      throw toTemplateQueryError(error);
    } finally {
      client?.release();
    }
  }

  return {
    execute,
    async close() {
      if (ownPool) await pool.end();
    },
  };
}
