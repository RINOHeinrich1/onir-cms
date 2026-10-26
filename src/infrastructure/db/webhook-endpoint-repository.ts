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
  template_key: string;
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
};

const COLUMNS =
  "id, organization_id, template_key, name, description, enabled, http_method, url, query_params, headers, body_mode, body_template, field_mappings, auth_type, auth_config_enc, timeout_ms, max_attempts, retry_backoff_ms, follow_redirects, tls_verify, allow_insecure_http, allow_private_network, created_by, created_at, updated_at, deleted_at";

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

function toEntity(row: EndpointRow): WebhookEndpoint {
  if (!isWebhookHttpMethod(row.http_method) || !isWebhookBodyMode(row.body_mode)) {
    throw new Error("Configuration de webhook invalide");
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    templateKey: row.template_key,
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
    input.templateKey,
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

/** Adapter PostgreSQL des endpoints de webhooks, scopé organisation. */
export function pgWebhookEndpointRepository(pool: Pool): WebhookEndpointRepository {
  return {
    async list(organizationId, templateKey = null) {
      const params: unknown[] = [organizationId];
      const templateClause = templateKey === null ? "" : "AND template_key = $2";
      if (templateKey !== null) params.push(templateKey);
      const { rows } = await pool.query<EndpointRow>(
        `SELECT ${COLUMNS} FROM webhook_endpoints
          WHERE organization_id = $1 AND deleted_at IS NULL ${templateClause}
          ORDER BY created_at DESC`,
        params,
      );
      return rows.map(toEntity);
    },

    async findById(organizationId, id) {
      const { rows } = await pool.query<EndpointRow>(
        `SELECT ${COLUMNS} FROM webhook_endpoints
          WHERE organization_id = $1 AND id = $2`,
        [organizationId, id],
      );
      return rows[0] ? toEntity(rows[0]) : null;
    },

    async create(organizationId, input) {
      const values = writeParams(input);
      const { rows } = await pool.query<EndpointRow>(
        `INSERT INTO webhook_endpoints
           (organization_id, template_key, name, description, enabled, http_method, url,
            query_params, headers, body_mode, body_template, field_mappings, auth_type,
            auth_config_enc, timeout_ms, max_attempts, retry_backoff_ms, follow_redirects,
            tls_verify, allow_insecure_http, allow_private_network, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
                 $17, $18, $19, $20, $21, $22)
         RETURNING ${COLUMNS}`,
        [organizationId, ...values, input.createdBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Échec de création du webhook");
      return toEntity(row);
    },

    async update(organizationId, id, input) {
      const values = writeParams(input);
      const { rows } = await pool.query<EndpointRow>(
        `UPDATE webhook_endpoints
            SET template_key = $3, name = $4, description = $5, enabled = $6,
                http_method = $7, url = $8, query_params = $9, headers = $10,
                body_mode = $11, body_template = $12, field_mappings = $13,
                auth_type = $14, auth_config_enc = $15, timeout_ms = $16,
                max_attempts = $17, retry_backoff_ms = $18, follow_redirects = $19,
                tls_verify = $20, allow_insecure_http = $21,
                allow_private_network = $22, updated_at = now()
          WHERE organization_id = $1 AND id = $2 AND deleted_at IS NULL
          RETURNING ${COLUMNS}`,
        [organizationId, id, ...values],
      );
      return rows[0] ? toEntity(rows[0]) : null;
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

    async listTemplateKeysReferenced(organizationId) {
      const { rows } = await pool.query<{ template_key: string }>(
        `SELECT DISTINCT template_key FROM webhook_endpoints
          WHERE organization_id = $1 AND deleted_at IS NULL`,
        [organizationId],
      );
      return rows.map((row) => row.template_key);
    },
  };
}
