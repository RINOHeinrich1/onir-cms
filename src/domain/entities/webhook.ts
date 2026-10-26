/**
 * Webhooks sortants (ADR-0035) — entités pures, sans dépendance framework.
 * Un endpoint est rattaché à un modèle de raisonnement ; une livraison est
 * l'exécution d'un endpoint sur une fiche.
 */

export const WEBHOOK_HTTP_METHODS = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"] as const;

export type WebhookHttpMethod = (typeof WEBHOOK_HTTP_METHODS)[number];

export const WEBHOOK_BODY_MODES = ["json", "form_urlencoded", "multipart", "raw"] as const;

export type WebhookBodyMode = (typeof WEBHOOK_BODY_MODES)[number];

export const WEBHOOK_AUTH_TYPES = [
  "none",
  "bearer",
  "basic",
  "api_key_header",
  "api_key_query",
  "hmac",
  "oauth2_client_credentials",
] as const;

export type WebhookAuthType = (typeof WEBHOOK_AUTH_TYPES)[number];

export const WEBHOOK_FIELD_SOURCES = ["field", "meta", "prospect", "attachment"] as const;

export type WebhookFieldSource = (typeof WEBHOOK_FIELD_SOURCES)[number];

export const WEBHOOK_FILE_MODES = ["signed_url", "base64", "multipart"] as const;

export type WebhookFileMode = (typeof WEBHOOK_FILE_MODES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ["queued", "running", "succeeded", "failed"] as const;

export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

const WEBHOOK_META_FIELDS = [
  "id",
  "createdAt",
  "templateKey",
  "templateVersion",
  "conversationId",
  "prospectId",
  "archivee",
] as const;

export type WebhookMetaField = (typeof WEBHOOK_META_FIELDS)[number];

const WEBHOOK_PROSPECT_FIELDS = [
  "id",
  "nom",
  "prenom",
  "nature",
  "email",
  "activite",
  "fonction",
  "detail",
  "origine",
  "lienId",
  "lienLabel",
  "createdAt",
  "updatedAt",
] as const;

export type WebhookProspectField = (typeof WEBHOOK_PROSPECT_FIELDS)[number];

export type WebhookHeader = {
  name: string;
  value: string;
  secret: boolean;
};

export type WebhookQueryParam = {
  name: string;
  value: string;
  secret: boolean;
};

export type WebhookFieldMapping = {
  source: WebhookFieldSource;
  field: string;
  target: string;
  required: boolean;
  fileMode: WebhookFileMode;
};

export type WebhookAuth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "api_key_header"; headerName: string; key: string }
  | { type: "api_key_query"; paramName: string; key: string }
  | { type: "hmac"; secret: string }
  | {
      type: "oauth2_client_credentials";
      tokenUrl: string;
      clientId: string;
      clientSecret: string;
      scope: string;
    };

export type WebhookEndpoint = {
  id: string;
  organizationId: string;
  templateKey: string;
  name: string;
  description: string;
  enabled: boolean;
  httpMethod: WebhookHttpMethod;
  url: string;
  queryParams: WebhookQueryParam[];
  headers: WebhookHeader[];
  bodyMode: WebhookBodyMode;
  bodyTemplate: string;
  fieldMappings: WebhookFieldMapping[];
  auth: WebhookAuth;
  timeoutMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  followRedirects: boolean;
  tlsVerify: boolean;
  allowInsecureHttp: boolean;
  allowPrivateNetwork: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};

export type WebhookRequestSnapshot = {
  method: WebhookHttpMethod;
  url: string;
  headers: Array<{ name: string; value: string }>;
  bodyPreview: string;
  bodyBytes: number;
  attachmentCount: number;
};

export type WebhookDelivery = {
  id: string;
  organizationId: string;
  endpointId: string;
  ficheId: string | null;
  templateKey: string;
  templateVersion: number;
  isTest: boolean;
  replayOfId: string | null;
  status: WebhookDeliveryStatus;
  attempts: number;
  nextAttemptAt: string | null;
  idempotencyKey: string;
  requestSnapshot: WebhookRequestSnapshot | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  triggeredBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type WebhookDeliveryAttempt = {
  id: string;
  deliveryId: string;
  attempt: number;
  status: string;
  httpStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export function isWebhookHttpMethod(value: string): value is WebhookHttpMethod {
  return (WEBHOOK_HTTP_METHODS as readonly string[]).includes(value);
}

export function isWebhookBodyMode(value: string): value is WebhookBodyMode {
  return (WEBHOOK_BODY_MODES as readonly string[]).includes(value);
}

export function isWebhookAuthType(value: string): value is WebhookAuthType {
  return (WEBHOOK_AUTH_TYPES as readonly string[]).includes(value);
}

export function isWebhookFieldSource(value: string): value is WebhookFieldSource {
  return (WEBHOOK_FIELD_SOURCES as readonly string[]).includes(value);
}

export function isWebhookFileMode(value: string): value is WebhookFileMode {
  return (WEBHOOK_FILE_MODES as readonly string[]).includes(value);
}

export function isWebhookDeliveryStatus(value: string): value is WebhookDeliveryStatus {
  return (WEBHOOK_DELIVERY_STATUSES as readonly string[]).includes(value);
}

export function isWebhookMetaField(value: string): value is WebhookMetaField {
  return (WEBHOOK_META_FIELDS as readonly string[]).includes(value);
}

export function isWebhookProspectField(value: string): value is WebhookProspectField {
  return (WEBHOOK_PROSPECT_FIELDS as readonly string[]).includes(value);
}

export { WEBHOOK_META_FIELDS, WEBHOOK_PROSPECT_FIELDS };

/** Champs de métadonnées proposés à la configuration. */
export const WEBHOOK_META_FIELD_LABELS: Record<WebhookMetaField, string> = {
  id: "Identifiant de la fiche",
  createdAt: "Date de création",
  templateKey: "Clé du modèle",
  templateVersion: "Version du modèle",
  conversationId: "Identifiant de conversation",
  prospectId: "Identifiant du prospect",
  archivee: "Fiche archivée",
};

export const WEBHOOK_PROSPECT_FIELD_LABELS: Record<WebhookProspectField, string> = {
  id: "Identifiant",
  nom: "Nom",
  prenom: "Prénom",
  nature: "Nature",
  email: "Email",
  activite: "Activité",
  fonction: "Fonction",
  detail: "Détail",
  origine: "Origine",
  lienId: "Identifiant du lien",
  lienLabel: "Libellé du lien",
  createdAt: "Date de création",
  updatedAt: "Date de mise à jour",
};

/** Bornes de configuration (les mêmes sont appliquées côté API et UI). */
export const WEBHOOK_LIMITS = {
  nameMin: 2,
  nameMax: 120,
  descriptionMax: 500,
  urlMax: 2000,
  headersMax: 50,
  queryParamsMax: 50,
  mappingsMax: 100,
  bodyTemplateMax: 100_000,
  bodyMaxBytes: 25 * 1024 * 1024,
  timeoutMin: 1000,
  timeoutMax: 30_000,
  attemptsMin: 1,
  attemptsMax: 5,
  backoffMin: 1000,
  backoffMax: 900_000,
  responseBodyMax: 64 * 1024,
  deliveryRetentionDays: 30,
} as const;

/** En-têtes qui ne doivent jamais être fournis par l'utilisateur. */
export const WEBHOOK_RESERVED_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "proxy-authorization",
  "proxy-authenticate",
  "keep-alive",
]);

/** En-têtes dont la valeur est masquée dans les journaux. */
export const WEBHOOK_SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-onir-signature",
]);

export function emptyWebhookAuth(): WebhookAuth {
  return { type: "none" };
}
