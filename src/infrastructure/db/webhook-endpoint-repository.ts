import type { Pool } from "pg";
import type {
  WebhookEndpointRepository,
  WebhookEndpointWriteInput,
} from "@/application/ports/webhook-endpoint-repository";
import {
  isWebhookAuthType,
  isWebhookBodyMode,
  isWebhookFieldSource,
  isWebhookFileMode,
  isWebhookHttpMethod,
  type WebhookAuth,
  type WebhookBodyMode,
  type WebhookEndpoint,
  type WebhookFieldMapping,
  type WebhookFieldSource,
  type WebhookFileMode,
  type WebhookHeader,
  type WebhookHttpMethod,
  type WebhookQueryParam,
  type WebhookTrigger,
} from "@/domain/entities/webhook";
import {
  openWebhookJson,
  openWebhookSecret,
  sealWebhookJson,
  sealWebhookSecret,
} from "@/lib/webhook-crypto";

type EndpointRow = {
  id: string;
  organization_id: string;
  chat_link_id: string | null;
  fiche_key: string | null;
  name: string;
  description: string;
  enabled: boolean;
  http_method: string;
  url: string;
  query_params: unknown;
  headers: unknown;
  body_mode: string;
  body_template: string;
  field_mappings: unknown;
  auth_type: string;
  auth_config_enc: string | null;
  timeout_ms: number;
  max_attempts: number;
  retry_backoff_ms: number;
  follow_redirects: boolean;
  tls_verify: boolean;
  allow_insecure_http: boolean;
  allow_private_network: boolean;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
  triggers?: unknown;
};

const COLUMNS =
  "id, organization_id, chat_link_id, fiche_key, name, description, enabled, http_method, url, query_params, headers, body_mode, body_template, field_mappings, auth_type, auth_config_enc, timeout_ms, max_attempts, retry_backoff_ms, follow_redirects, tls_verify, allow_insecure_http, allow_private_network, created_by, created_at, updated_at, deleted_at";

const TRIGGER_COLUMNS =
  "COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType', t.event_type, 'fieldKey', t.field_key, 'fieldKeys', t.field_keys) ORDER BY t.event_type, t.field_key) FROM webhook_endpoint_triggers t WHERE t.endpoint_id = webhook_endpoints.id), '[]'::jsonb) AS triggers";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseHeaders(value: unknown): WebhookHeader[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const name = typeof entry.name === "string" ? entry.name : "";
    const rawValue = typeof entry.value === "string" ? entry.value : "";
    const secret = entry.secret === true;
    if (name === "") return [];
    return [
      {
        name,
        value: secret ? openWebhookSecret(rawValue) : rawValue,
        secret,
      },
    ];
  });
}

function parseQueryParams(value: unknown): WebhookQueryParam[] {
  return parseHeaders(value).map((entry) => ({ ...entry }));
}

function parseFieldMappings(value: unknown): WebhookFieldMapping[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const source = typeof entry.source === "string" ? entry.source : "";
    const field = typeof entry.field === "string" ? entry.field : "";
    const target = typeof entry.target === "string" ? entry.target : "";
    const fileMode = typeof entry.fileMode === "string" ? entry.fileMode : "";
    if (
      !isWebhookFieldSource(source) ||
      field === "" ||
      target === "" ||
      !isWebhookFileMode(fileMode)
    ) {
      return [];
    }
    return [
      {
        source: source as WebhookFieldSource,
        field,
        target,
        required: entry.required === true,
        fileMode: fileMode as WebhookFileMode,
      },
    ];
  });
}

function parseAuth(type: string, encrypted: string | null): WebhookAuth {
  if (!isWebhookAuthType(type) || type === "none" || encrypted === null) {
    return { type: "none" };
  }
  return openWebhookJson<WebhookAuth>(encrypted);
}

function secretJson(input: readonly { name: string; value: string; secret: boolean }[]): unknown[] {
  return input.map((entry) => ({
    name: entry.name,
    value: entry.secret ? sealWebhookSecret(entry.value) : entry.value,
    secret: entry.secret,
  }));
}

function authEncrypted(auth: WebhookAuth): string | null {
  return auth.type === "none" ? null : sealWebhookJson(auth);
}

function parseTriggers(value: unknown): WebhookTrigger[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const eventType = typeof entry.eventType === "string" ? entry.eventType : "";
    const fieldKey = typeof entry.fieldKey === "string" ? entry.fieldKey : null;
    const fieldKeys = Array.isArray(entry.fieldKeys)
      ? entry.fieldKeys.filter((value): value is string => typeof value === "string")
      : null;
    if (
      eventType !== "fiche.draft.all_fields_filled" &&
      eventType !== "fiche.draft.field_filled" &&
      eventType !== "fiche.draft.fields_filled" &&
      eventType !== "fiche.draft.required_fields_filled" &&
      eventType !== "fiche.validated"
    ) {
      return [];
    }
    return [{ eventType, fieldKey, fieldKeys }];
  });
}

function toEntity(row: EndpointRow): WebhookEndpoint {
  if (!isWebhookHttpMethod(row.http_method) || !isWebhookBodyMode(row.body_mode)) {
    throw new Error("Configuration de webhook invalide");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    chatLinkId: row.chat_link_id,
    ficheKey: row.fiche_key,
    name: row.name,
    description: row.description,
    enabled: row.enabled,
    httpMethod: row.http_method as WebhookHttpMethod,
    url: row.url,
    queryParams: parseQueryParams(row.query_params),
    headers: parseHeaders(row.headers),
    bodyMode: row.body_mode as WebhookBodyMode,
    bodyTemplate: row.body_template,
    fieldMappings: parseFieldMappings(row.field_mappings),
    triggers: parseTriggers(row.triggers),
    auth: parseAuth(row.auth_type, row.auth_config_enc),
    timeoutMs: row.timeout_ms,
    maxAttempts: row.max_attempts,
    retryBackoffMs: row.retry_backoff_ms,
    followRedirects: row.follow_redirects,
    tlsVerify: row.tls_verify,
    allowInsecureHttp: row.allow_insecure_http,
    allowPrivateNetwork: row.allow_private_network,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

function writeParams(input: WebhookEndpointWriteInput): unknown[] {
  return [
    input.chatLinkId,
    input.ficheKey,
    input.name,
    input.description,
    input.enabled,
    input.httpMethod,
    input.url,
    JSON.stringify(secretJson(input.queryParams)),
    JSON.stringify(secretJson(input.headers)),
    input.bodyMode,
    input.bodyTemplate,
    JSON.stringify(input.fieldMappings),
    input.auth.type,
    authEncrypted(input.auth),
    input.timeoutMs,
    input.maxAttempts,
    input.retryBackoffMs,
    input.followRedirects,
    input.tlsVerify,
    input.allowInsecureHttp,
    input.allowPrivateNetwork,
  ];
}

async function replaceTriggers(
  client: import("pg").PoolClient,
  endpointId: string,
  triggers: readonly WebhookTrigger[],
): Promise<void> {
  await client.query("DELETE FROM webhook_endpoint_triggers WHERE endpoint_id = $1", [endpointId]);
  for (const trigger of triggers) {
    await client.query(
      `INSERT INTO webhook_endpoint_triggers
       (endpoint_id, event_type, field_key, field_keys)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`,
      [endpointId, trigger.eventType, trigger.fieldKey, trigger.fieldKeys],
    );
  }
}

/** Adapter PostgreSQL des endpoints de webhooks, scopé organisation. */
export function pgWebhookEndpointRepository(pool: Pool): WebhookEndpointRepository {
  return {
    async list(organizationId, filter = {}) {
      const clauses = ["organization_id = $1", "deleted_at IS NULL"];
      const params: unknown[] = [organizationId];
      if (filter.chatLinkId !== undefined && filter.chatLinkId !== null) {
        params.push(filter.chatLinkId);
        clauses.push(`chat_link_id = $${params.length}`);
      }
      const { rows } = await pool.query<EndpointRow>(
        `SELECT ${COLUMNS}, ${TRIGGER_COLUMNS} FROM webhook_endpoints
          WHERE ${clauses.join(" AND ")}
          ORDER BY created_at DESC`,
        params,
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<EndpointRow>(
        `SELECT ${COLUMNS}, ${TRIGGER_COLUMNS} FROM webhook_endpoints
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async create(organizationId, input) {
      const values = writeParams(input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<EndpointRow>(
          `INSERT INTO webhook_endpoints
             (organization_id, chat_link_id, fiche_key, name, description,
              enabled, http_method, url, query_params, headers, body_mode, body_template,
              field_mappings, auth_type, auth_config_enc, timeout_ms, max_attempts,
              retry_backoff_ms, follow_redirects, tls_verify, allow_insecure_http,
              allow_private_network, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                   $17, $18, $19, $20, $21, $22, $23)
           RETURNING ${COLUMNS}`,
          [organizationId, ...values, input.createdBy],
        );
        const row = rows[0];
        if (!row) throw new Error("Échec de création du webhook");
        await replaceTriggers(client, row.id, input.triggers);
        await client.query("COMMIT");
        return toEntity({ ...row, triggers: input.triggers });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async update(organizationId, id, input) {
      const values = writeParams(input);
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query<EndpointRow>(
          `UPDATE webhook_endpoints
              SET chat_link_id = $3, fiche_key = $4, name = $5,
                  description = $6, enabled = $7, http_method = $8, url = $9,
                  query_params = $10, headers = $11, body_mode = $12, body_template = $13,
                  field_mappings = $14, auth_type = $15, auth_config_enc = $16,
                  timeout_ms = $17, max_attempts = $18, retry_backoff_ms = $19,
                  follow_redirects = $20, tls_verify = $21, allow_insecure_http = $22,
                  allow_private_network = $23, updated_at = now()
            WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
            RETURNING ${COLUMNS}`,
          [organizationId, id, ...values],
        );
        const row = rows[0];
        if (!row) {
          await client.query("ROLLBACK");
          return null;
        }
        await replaceTriggers(client, row.id, input.triggers);
        await client.query("COMMIT");
        return toEntity({ ...row, triggers: input.triggers });
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },

    async listAutomaticTriggers(organizationId, chatLinkId, ficheKey) {
      const { rows } = await pool.query<{
        event_type: string;
        field_key: string | null;
        field_keys: string[] | null;
      }>(
        `SELECT DISTINCT t.event_type, t.field_key, t.field_keys
           FROM webhook_endpoints e
           JOIN webhook_endpoint_triggers t ON t.endpoint_id = e.id
          WHERE e.organization_id = $1
            AND e.chat_link_id = $2
            AND e.enabled = true
            AND e.deleted_at IS NULL
            AND (e.fiche_key IS NULL OR e.fiche_key = $3)`,
        [organizationId, chatLinkId, ficheKey],
      );
      return rows.flatMap((row) => {
        if (
          row.event_type !== "fiche.draft.all_fields_filled" &&
          row.event_type !== "fiche.draft.field_filled" &&
          row.event_type !== "fiche.draft.fields_filled" &&
          row.event_type !== "fiche.draft.required_fields_filled" &&
          row.event_type !== "fiche.validated"
        ) {
          return [];
        }
        return [
          {
            eventType: row.event_type,
            fieldKey: row.field_key,
            fieldKeys: row.field_keys,
          },
        ];
      });
    },

    async hasAutomaticTriggers(organizationId, chatLinkId, ficheKey) {
      const { rows } = await pool.query<{ exists: boolean }>(
        `SELECT EXISTS (
           SELECT 1
             FROM webhook_endpoints e
             JOIN webhook_endpoint_triggers t ON t.endpoint_id = e.id
            WHERE e.organization_id = $1
              AND e.chat_link_id = $2
              AND e.enabled = true
              AND e.deleted_at IS NULL
              AND (e.fiche_key IS NULL OR e.fiche_key = $3)
         ) AS exists`,
        [organizationId, chatLinkId, ficheKey],
      );
      return rows[0]?.exists === true;
    },

    async softDelete(organizationId, id) {
      const result = await pool.query(
        `UPDATE webhook_endpoints
            SET deleted_at = now(), enabled = false, updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [organizationId, id],
      );
      return (result.rowCount ?? 0) > 0;
    },
  };
}
