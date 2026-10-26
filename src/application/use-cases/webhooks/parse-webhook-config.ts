import { ValidationError } from "@/application/errors";
import type { WebhookEndpointWriteInput } from "@/application/ports/webhook-endpoint-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
  isWebhookAuthType,
  isWebhookBodyMode,
  isWebhookFieldSource,
  isWebhookFileMode,
  isWebhookHttpMethod,
  isWebhookMetaField,
  isWebhookProspectField,
  WEBHOOK_BODY_MODES,
  WEBHOOK_FILE_MODES,
  WEBHOOK_HTTP_METHODS,
  WEBHOOK_LIMITS,
  WEBHOOK_META_FIELDS,
  WEBHOOK_PROSPECT_FIELDS,
  WEBHOOK_RESERVED_HEADERS,
  type WebhookAuth,
  type WebhookBodyMode,
  type WebhookEndpoint,
  type WebhookFieldMapping,
  type WebhookHeader,
  type WebhookHttpMethod,
  type WebhookQueryParam,
} from "@/domain/entities/webhook";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, label: string, max: number, required = false): string {
  if (typeof value !== "string") {
    if (required) throw new ValidationError(`${label} est requis`);
    return "";
  }
  const trimmed = value.trim();
  if (required && trimmed === "") throw new ValidationError(`${label} est requis`);
  if (trimmed.length > max) throw new ValidationError(`${label} est trop long`);
  return trimmed;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function integer(
  value: unknown,
  label: string,
  min: number,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new ValidationError(`${label} doit être compris entre ${min} et ${max}`);
  }
  return parsed;
}

const HEADER_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const TARGET_PATH = /^[A-Za-z_][A-Za-z0-9_-]*(\.[A-Za-z_][A-Za-z0-9_-]*)*$/;

function parseHeaderName(value: unknown): string {
  const name = text(value, "Nom d'en-tête", 120, true);
  if (!HEADER_NAME.test(name)) throw new ValidationError(`Nom d'en-tête invalide : ${name}`);
  if (WEBHOOK_RESERVED_HEADERS.has(name.toLowerCase())) {
    throw new ValidationError(`En-tête réservé : ${name}`);
  }
  return name;
}

function parseHeaders(value: unknown, existing: readonly WebhookHeader[] = []): WebhookHeader[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > WEBHOOK_LIMITS.headersMax) {
    throw new ValidationError(`En-têtes invalides (${WEBHOOK_LIMITS.headersMax} maximum)`);
  }
  const names = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)) throw new ValidationError("En-tête invalide");
    const name = parseHeaderName(entry.name);
    const key = name.toLowerCase();
    if (names.has(key)) throw new ValidationError(`En-tête en double : ${name}`);
    names.add(key);
    const secret = entry.secret === true;
    const rawValue = typeof entry.value === "string" ? entry.value : "";
    const value = secret
      ? rawValue === ""
        ? (existing.find((candidate) => candidate.name.toLowerCase() === key)?.value ?? "")
        : rawValue
      : rawValue;
    if (secret && value === "") {
      throw new ValidationError(`Valeur secrète requise pour l'en-tête ${name}`);
    }
    if (value.length > 4000) throw new ValidationError(`Valeur d'en-tête trop longue : ${name}`);
    return { name, value, secret };
  });
}

function parseQueryParams(
  value: unknown,
  existing: readonly WebhookQueryParam[] = [],
): WebhookQueryParam[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > WEBHOOK_LIMITS.queryParamsMax) {
    throw new ValidationError(`Paramètres invalides (${WEBHOOK_LIMITS.queryParamsMax} maximum)`);
  }
  const names = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)) throw new ValidationError("Paramètre invalide");
    const name = text(entry.name, "Nom du paramètre", 120, true);
    if (!HEADER_NAME.test(name)) throw new ValidationError(`Paramètre invalide : ${name}`);
    if (names.has(name)) throw new ValidationError(`Paramètre en double : ${name}`);
    names.add(name);
    const secret = entry.secret === true;
    const rawValue = typeof entry.value === "string" ? entry.value : "";
    const value = secret
      ? rawValue === ""
        ? (existing.find((candidate) => candidate.name === name)?.value ?? "")
        : rawValue
      : rawValue;
    if (secret && value === "") {
      throw new ValidationError(`Valeur secrète requise pour le paramètre ${name}`);
    }
    if (value.length > 2000) throw new ValidationError(`Paramètre trop long : ${name}`);
    return { name, value, secret };
  });
}

function parseAuth(value: unknown, existing: WebhookAuth | null): WebhookAuth {
  const source = isRecord(value) ? value : {};
  const typeRaw = typeof source.type === "string" ? source.type : "none";
  if (!isWebhookAuthType(typeRaw)) throw new ValidationError("Type d'authentification invalide");

  const previous = existing !== null && existing.type === typeRaw ? existing : null;
  switch (typeRaw) {
    case "none":
      return { type: "none" };
    case "bearer": {
      const token = text(source.token, "Token Bearer", 8000);
      const resolved = token === "" && previous?.type === "bearer" ? previous.token : token;
      if (resolved === "") throw new ValidationError("Token Bearer requis");
      return { type: "bearer", token: resolved };
    }
    case "basic": {
      const username = text(source.username, "Identifiant Basic", 500, true);
      const password = text(source.password, "Mot de passe Basic", 4000);
      const resolved = password === "" && previous?.type === "basic" ? previous.password : password;
      if (resolved === "") throw new ValidationError("Mot de passe Basic requis");
      return { type: "basic", username, password: resolved };
    }
    case "api_key_header": {
      const headerName = parseHeaderName(source.headerName);
      if (headerName.toLowerCase() === "authorization") {
        throw new ValidationError("Utilisez le type Bearer pour Authorization");
      }
      const key = text(source.key, "Clé API", 8000);
      const resolved = key === "" && previous?.type === "api_key_header" ? previous.key : key;
      if (resolved === "") throw new ValidationError("Clé API requise");
      return { type: "api_key_header", headerName, key: resolved };
    }
    case "api_key_query": {
      const paramName = text(source.paramName, "Nom du paramètre", 120, true);
      if (!HEADER_NAME.test(paramName)) throw new ValidationError("Paramètre de clé invalide");
      const key = text(source.key, "Clé API", 8000);
      const resolved = key === "" && previous?.type === "api_key_query" ? previous.key : key;
      if (resolved === "") throw new ValidationError("Clé API requise");
      return { type: "api_key_query", paramName, key: resolved };
    }
    case "hmac": {
      const secret = text(source.secret, "Secret HMAC", 8000);
      const resolved = secret === "" && previous?.type === "hmac" ? previous.secret : secret;
      if (resolved === "") throw new ValidationError("Secret HMAC requis");
      return { type: "hmac", secret: resolved };
    }
    case "oauth2_client_credentials": {
      const tokenUrl = parseHttpUrl(source.tokenUrl, "URL du token OAuth2");
      const clientId = text(source.clientId, "Client ID OAuth2", 500, true);
      const clientSecret = text(source.clientSecret, "Client secret OAuth2", 8000);
      const resolved =
        clientSecret === "" && previous?.type === "oauth2_client_credentials"
          ? previous.clientSecret
          : clientSecret;
      if (resolved === "") throw new ValidationError("Client secret OAuth2 requis");
      return {
        type: "oauth2_client_credentials",
        tokenUrl,
        clientId,
        clientSecret: resolved,
        scope: text(source.scope, "Scope OAuth2", 1000),
      };
    }
    default:
      throw new ValidationError("Type d'authentification invalide");
  }
}

function parseHttpUrl(value: unknown, label: string): string {
  const raw = text(value, label, WEBHOOK_LIMITS.urlMax, true);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ValidationError(`${label} invalide`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ValidationError(`${label} doit être en http(s)`);
  }
  if (parsed.username !== "" || parsed.password !== "") {
    throw new ValidationError(`${label} ne doit pas contenir d'identifiants`);
  }
  return parsed.toString();
}

function parseMappings(value: unknown): WebhookFieldMapping[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > WEBHOOK_LIMITS.mappingsMax) {
    throw new ValidationError(`Mapping invalide (${WEBHOOK_LIMITS.mappingsMax} maximum)`);
  }
  const targets = new Set<string>();
  return value.map((entry) => {
    if (!isRecord(entry)) throw new ValidationError("Mapping invalide");
    const source = typeof entry.source === "string" ? entry.source : "";
    if (!isWebhookFieldSource(source)) throw new ValidationError("Source de champ invalide");
    const field = text(entry.field, "Champ source", 120, true);
    const target = text(entry.target, "Clé cible", 120, true);
    if (!TARGET_PATH.test(target) || target === "__proto__" || target === "constructor") {
      throw new ValidationError(`Clé cible invalide : ${target}`);
    }
    if (targets.has(target)) throw new ValidationError(`Clé cible en double : ${target}`);
    targets.add(target);
    const fileModeRaw = typeof entry.fileMode === "string" ? entry.fileMode : "signed_url";
    if (!isWebhookFileMode(fileModeRaw)) throw new ValidationError("Mode fichier invalide");
    return {
      source,
      field,
      target,
      required: entry.required === true,
      fileMode: fileModeRaw,
    };
  });
}

export function assertMappingsForDefinition(
  mappings: readonly WebhookFieldMapping[],
  definition: TemplateDefinition,
): void {
  const modelFields = new Map(definition.fields.map((field) => [field.name, field]));
  for (const mapping of mappings) {
    if (mapping.source === "meta") {
      if (!isWebhookMetaField(mapping.field)) {
        throw new ValidationError(`Métadonnée inconnue : ${mapping.field}`);
      }
      continue;
    }
    if (mapping.source === "prospect") {
      if (!isWebhookProspectField(mapping.field)) {
        throw new ValidationError(`Champ prospect inconnu : ${mapping.field}`);
      }
      continue;
    }
    const field = modelFields.get(mapping.field);
    if (field === undefined) {
      throw new ValidationError(`Champ du modèle inconnu : ${mapping.field}`);
    }
    if (mapping.source === "attachment" && field.type !== "file") {
      throw new ValidationError(`Le champ ${mapping.field} n'est pas un fichier`);
    }
    if (mapping.source === "field" && field.type === "file") {
      throw new ValidationError(`Le champ ${mapping.field} doit utiliser la source pièce jointe`);
    }
  }
}

export type ParsedWebhookConfig = Omit<WebhookEndpointWriteInput, "createdBy">;

/**
 * Valide et normalise la configuration d'un endpoint.
 * `existing` permet de conserver les secrets non ressaisis lors d'une édition.
 */
export function parseWebhookConfig(
  input: unknown,
  existing: WebhookEndpoint | null = null,
): ParsedWebhookConfig {
  const source = isRecord(input) ? input : {};
  const httpMethodRaw = typeof source.httpMethod === "string" ? source.httpMethod : "POST";
  if (!isWebhookHttpMethod(httpMethodRaw)) {
    throw new ValidationError("Méthode HTTP invalide");
  }
  const bodyModeRaw = typeof source.bodyMode === "string" ? source.bodyMode : "json";
  if (!isWebhookBodyMode(bodyModeRaw)) throw new ValidationError("Mode de corps invalide");
  const mappings = parseMappings(source.fieldMappings);
  const headers = parseHeaders(source.headers, existing?.headers ?? []);
  const queryParams = parseQueryParams(source.queryParams, existing?.queryParams ?? []);
  const bodyTemplate =
    source.bodyTemplate === undefined && existing !== null
      ? existing.bodyTemplate
      : typeof source.bodyTemplate === "string"
        ? source.bodyTemplate
        : "";
  if (bodyTemplate.length > WEBHOOK_LIMITS.bodyTemplateMax) {
    throw new ValidationError("Template de corps trop long");
  }
  if (webhookBodyNeedsTemplate(bodyModeRaw) && bodyTemplate === "" && mappings.length === 0) {
    throw new ValidationError("Un mapping ou un template de corps est requis");
  }
  for (const mapping of mappings) {
    if (mapping.source !== "attachment") continue;
    if (bodyModeRaw === "multipart" && mapping.fileMode !== "multipart") {
      throw new ValidationError("En multipart, les fichiers doivent utiliser le mode multipart");
    }
    if (bodyModeRaw !== "multipart" && mapping.fileMode === "multipart") {
      throw new ValidationError("Le mode fichier multipart exige un corps multipart");
    }
  }
  if (bodyModeRaw === "multipart" && bodyTemplate.trim() !== "") {
    throw new ValidationError("Le template de corps n'est pas utilisé en multipart");
  }
  const name = text(source.name, "Nom", WEBHOOK_LIMITS.nameMax, true);
  if (name.length < WEBHOOK_LIMITS.nameMin) {
    throw new ValidationError(`Le nom doit contenir au moins ${WEBHOOK_LIMITS.nameMin} caractères`);
  }

  return {
    templateKey: text(source.templateKey, "Modèle", 120, true),
    name,
    description: text(source.description, "Description", WEBHOOK_LIMITS.descriptionMax),
    enabled: bool(source.enabled, true),
    httpMethod: httpMethodRaw as WebhookHttpMethod,
    url: parseHttpUrl(source.url, "URL"),
    queryParams,
    headers,
    bodyMode: bodyModeRaw as WebhookBodyMode,
    bodyTemplate,
    fieldMappings: mappings,
    auth: parseAuth(source.auth, existing?.auth ?? null),
    timeoutMs: integer(
      source.timeoutMs,
      "Timeout",
      WEBHOOK_LIMITS.timeoutMin,
      WEBHOOK_LIMITS.timeoutMax,
      10_000,
    ),
    maxAttempts: integer(
      source.maxAttempts,
      "Tentatives",
      WEBHOOK_LIMITS.attemptsMin,
      WEBHOOK_LIMITS.attemptsMax,
      3,
    ),
    retryBackoffMs: integer(
      source.retryBackoffMs,
      "Délai de reprise",
      WEBHOOK_LIMITS.backoffMin,
      WEBHOOK_LIMITS.backoffMax,
      30_000,
    ),
    followRedirects: bool(source.followRedirects, false),
    tlsVerify: bool(source.tlsVerify, true),
    allowInsecureHttp: bool(source.allowInsecureHttp, false),
    allowPrivateNetwork: bool(source.allowPrivateNetwork, false),
  };
}

function webhookBodyNeedsTemplate(mode: WebhookBodyMode): boolean {
  return mode !== "multipart";
}

export function webhookFileModes(): readonly string[] {
  return WEBHOOK_FILE_MODES;
}

export function webhookHttpMethods(): readonly string[] {
  return WEBHOOK_HTTP_METHODS;
}

export function webhookBodyModes(): readonly string[] {
  return WEBHOOK_BODY_MODES;
}

export function webhookMetaFields(): readonly string[] {
  return WEBHOOK_META_FIELDS;
}

export function webhookProspectFields(): readonly string[] {
  return WEBHOOK_PROSPECT_FIELDS;
}
