import type {
  WebhookAuth,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookFieldMapping,
  WebhookHeader,
  WebhookQueryParam,
} from "@/domain/entities/webhook";

export type WebhookAuthDto = WebhookAuth;

export type WebhookEndpointAdminDto = {
  id: string;
  templateKey: string;
  name: string;
  description: string;
  enabled: boolean;
  httpMethod: WebhookEndpoint["httpMethod"];
  url: string;
  queryParams: WebhookQueryParam[];
  headers: WebhookHeader[];
  bodyMode: WebhookEndpoint["bodyMode"];
  bodyTemplate: string;
  fieldMappings: WebhookFieldMapping[];
  auth: WebhookAuthDto;
  authConfigured: boolean;
  timeoutMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  followRedirects: boolean;
  tlsVerify: boolean;
  allowInsecureHttp: boolean;
  allowPrivateNetwork: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WebhookEndpointPublicDto = {
  id: string;
  templateKey: string;
  name: string;
  description: string;
  enabled: boolean;
};

export type WebhookDeliveryDto = {
  id: string;
  endpointId: string;
  ficheId: string | null;
  templateKey: string;
  templateVersion: number;
  isTest: boolean;
  replayOfId: string | null;
  status: WebhookDelivery["status"];
  attempts: number;
  nextAttemptAt: string | null;
  responseStatus: number | null;
  responseBody: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  requestSnapshot: WebhookDelivery["requestSnapshot"];
};

function maskAuth(auth: WebhookAuth): WebhookAuth {
  switch (auth.type) {
    case "none":
      return { type: "none" };
    case "bearer":
      return { type: "bearer", token: "" };
    case "basic":
      return { type: "basic", username: auth.username, password: "" };
    case "api_key_header":
      return { type: "api_key_header", headerName: auth.headerName, key: "" };
    case "api_key_query":
      return { type: "api_key_query", paramName: auth.paramName, key: "" };
    case "hmac":
      return { type: "hmac", secret: "" };
    case "oauth2_client_credentials":
      return {
        type: "oauth2_client_credentials",
        tokenUrl: auth.tokenUrl,
        clientId: auth.clientId,
        clientSecret: "",
        scope: auth.scope,
      };
  }
}

export function toWebhookEndpointAdminDto(endpoint: WebhookEndpoint): WebhookEndpointAdminDto {
  return {
    id: endpoint.id,
    templateKey: endpoint.templateKey,
    name: endpoint.name,
    description: endpoint.description,
    enabled: endpoint.enabled,
    httpMethod: endpoint.httpMethod,
    url: endpoint.url,
    queryParams: endpoint.queryParams.map((entry) => ({
      ...entry,
      value: entry.secret ? "" : entry.value,
    })),
    headers: endpoint.headers.map((entry) => ({
      ...entry,
      value: entry.secret ? "" : entry.value,
    })),
    bodyMode: endpoint.bodyMode,
    bodyTemplate: endpoint.bodyTemplate,
    fieldMappings: endpoint.fieldMappings,
    auth: maskAuth(endpoint.auth),
    authConfigured: endpoint.auth.type !== "none",
    timeoutMs: endpoint.timeoutMs,
    maxAttempts: endpoint.maxAttempts,
    retryBackoffMs: endpoint.retryBackoffMs,
    followRedirects: endpoint.followRedirects,
    tlsVerify: endpoint.tlsVerify,
    allowInsecureHttp: endpoint.allowInsecureHttp,
    allowPrivateNetwork: endpoint.allowPrivateNetwork,
    createdAt: endpoint.createdAt,
    updatedAt: endpoint.updatedAt,
  };
}

export function toWebhookEndpointPublicDto(endpoint: WebhookEndpoint): WebhookEndpointPublicDto {
  return {
    id: endpoint.id,
    templateKey: endpoint.templateKey,
    name: endpoint.name,
    description: endpoint.description,
    enabled: endpoint.enabled,
  };
}

export function toWebhookDeliveryDto(delivery: WebhookDelivery): WebhookDeliveryDto {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    ficheId: delivery.ficheId,
    templateKey: delivery.templateKey,
    templateVersion: delivery.templateVersion,
    isTest: delivery.isTest,
    replayOfId: delivery.replayOfId,
    status: delivery.status,
    attempts: delivery.attempts,
    nextAttemptAt: delivery.nextAttemptAt,
    responseStatus: delivery.responseStatus,
    responseBody: delivery.responseBody,
    errorCode: delivery.errorCode,
    errorMessage: delivery.errorMessage,
    startedAt: delivery.startedAt,
    finishedAt: delivery.finishedAt,
    createdAt: delivery.createdAt,
    requestSnapshot: delivery.requestSnapshot,
  };
}
