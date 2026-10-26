import { createHash, createHmac } from "node:crypto";
import http, { type IncomingHttpHeaders, type RequestOptions } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import {
  type WebhookHttpRequest,
  WebhookSendError,
  type WebhookSender,
  type WebhookSendResult,
} from "@/application/ports/webhook-sender";
import type { WebhookEndpoint } from "@/domain/entities/webhook";
import { WEBHOOK_LIMITS } from "@/domain/entities/webhook";
import { type ResolvedWebhookAddress, resolveWebhookTarget } from "@/lib/webhook-ssrf";

type RawResponse = {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  truncated: boolean;
  durationMs: number;
};

type TokenCache = Map<string, { token: string; expiresAt: number }>;
const tokenCache: TokenCache = new Map();

function responseBody(buffer: Buffer, truncated: boolean): string {
  const text = buffer.toString("utf8");
  return truncated ? `${text}\n[response tronquée]` : text;
}

function pickupAddresses(addresses: readonly ResolvedWebhookAddress[]): LookupFunction {
  return ((_hostname, _options, callback) => {
    const first = addresses[0];
    if (first === undefined) {
      const error = new Error("Adresse de webhook indisponible") as NodeJS.ErrnoException;
      error.code = "ENOTFOUND";
      callback(error, "", 0);
      return;
    }
    callback(null, first.address, first.family);
  }) as LookupFunction;
}

function requestOnce(input: {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: Buffer;
  timeoutMs: number;
  tlsVerify: boolean;
  addresses: readonly ResolvedWebhookAddress[];
}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const isHttps = input.url.protocol === "https:";
    const transport = isHttps ? https : http;
    const hostname = input.url.hostname.startsWith("[")
      ? input.url.hostname.slice(1, -1)
      : input.url.hostname;
    const options: RequestOptions = {
      protocol: input.url.protocol,
      hostname,
      port: input.url.port === "" ? undefined : Number(input.url.port),
      path: `${input.url.pathname}${input.url.search}`,
      method: input.method,
      headers: input.headers,
      lookup: pickupAddresses(input.addresses),
    };
    if (isHttps) {
      (options as https.RequestOptions).rejectUnauthorized = input.tlsVerify;
    }

    const request = transport.request(options, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      response.on("data", (chunk: Buffer) => {
        if (size >= WEBHOOK_LIMITS.responseBodyMax) {
          truncated = true;
          return;
        }
        const remaining = WEBHOOK_LIMITS.responseBodyMax - size;
        const slice = chunk.length > remaining ? chunk.subarray(0, remaining) : chunk;
        chunks.push(slice);
        size += slice.length;
        if (slice.length < chunk.length) truncated = true;
      });
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks),
          truncated,
          durationMs: Date.now() - started,
        });
      });
      response.on("error", (error) => reject(error));
    });

    request.setTimeout(input.timeoutMs, () => {
      const error = new Error("Délai d'attente du webhook dépassé") as NodeJS.ErrnoException;
      error.code = "ETIMEDOUT";
      request.destroy(error);
    });
    request.on("error", (error) => reject(error));
    if (input.body.length > 0 && input.method !== "GET" && input.method !== "HEAD") {
      request.write(input.body);
    }
    request.end();
  });
}

function redirectMethod(status: number, method: string): { method: string; keepBody: boolean } {
  if (status === 303) return { method: "GET", keepBody: false };
  if ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD") {
    return { method: "GET", keepBody: false };
  }
  return { method, keepBody: true };
}

async function requestWithRedirects(input: {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: Buffer;
  timeoutMs: number;
  tlsVerify: boolean;
  followRedirects: boolean;
  allowInsecureHttp: boolean;
  allowPrivateNetwork: boolean;
}): Promise<RawResponse> {
  let currentUrl = input.url;
  let method = input.method;
  let body = input.body;
  const headers = { ...input.headers };
  let redirects = 0;
  while (true) {
    const target = await resolveWebhookTarget(
      currentUrl.toString(),
      input.allowPrivateNetwork,
      input.allowInsecureHttp,
    );
    const response = await requestOnce({
      url: target.url,
      method,
      headers,
      body,
      timeoutMs: input.timeoutMs,
      tlsVerify: input.tlsVerify,
      addresses: target.addresses,
    });
    if (!input.followRedirects || response.status < 300 || response.status >= 400) {
      return response;
    }
    const location = response.headers.location;
    if (typeof location !== "string" || redirects >= 3) return response;
    redirects += 1;
    let next: URL;
    try {
      next = new URL(location, currentUrl);
    } catch {
      return response;
    }
    if (next.protocol !== "http:" && next.protocol !== "https:") return response;
    if (next.hostname !== currentUrl.hostname) {
      throw new WebhookSendError("Redirection cross-origin refusée", {
        retryable: false,
        code: "cross_origin_redirect",
      });
    }
    if (currentUrl.protocol === "https:" && next.protocol !== "https:") {
      throw new WebhookSendError("Redirection HTTPS vers HTTP refusée", {
        retryable: false,
        code: "insecure_redirect",
      });
    }
    const nextMethod = redirectMethod(response.status, method);
    method = nextMethod.method;
    if (!nextMethod.keepBody) {
      body = Buffer.alloc(0);
      for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === "content-length") delete headers[name];
      }
    }
    currentUrl = next;
  }
}

function setHeader(headers: Record<string, string>, name: string, value: string): void {
  const existing = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
  if (existing !== undefined) delete headers[existing];
  headers[name] = value;
}

function normalizeHeaders(headers: Record<string, string>, body: Buffer, method: string): void {
  for (const name of Object.keys(headers)) {
    if (
      ["content-length", "host", "connection", "transfer-encoding"].includes(name.toLowerCase())
    ) {
      delete headers[name];
    }
  }
  if (body.length > 0 && method !== "GET" && method !== "HEAD") {
    headers["Content-Length"] = String(body.length);
  }
  if (headers["User-Agent"] === undefined) headers["User-Agent"] = "ONIR-CMS-Webhook/1.0";
}

async function oauthToken(endpoint: WebhookEndpoint, request: WebhookHttpRequest): Promise<string> {
  if (endpoint.auth.type !== "oauth2_client_credentials") {
    throw new WebhookSendError("Authentification OAuth2 invalide", {
      retryable: false,
      code: "auth_configuration",
    });
  }
  const cacheKey = `${endpoint.id}:${endpoint.auth.tokenUrl}:${endpoint.auth.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached !== undefined && cached.expiresAt > Date.now() + 30_000) return cached.token;

  const form = new URLSearchParams({ grant_type: "client_credentials" });
  if (endpoint.auth.scope !== "") form.set("scope", endpoint.auth.scope);
  const basic = Buffer.from(
    `${endpoint.auth.clientId}:${endpoint.auth.clientSecret}`,
    "utf8",
  ).toString("base64");
  let response: RawResponse;
  try {
    const target = await resolveWebhookTarget(
      endpoint.auth.tokenUrl,
      request.allowPrivateNetwork,
      endpoint.allowInsecureHttp,
    );
    response = await requestOnce({
      url: target.url,
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(form.toString())),
        Accept: "application/json",
      },
      body: Buffer.from(form.toString()),
      timeoutMs: request.timeoutMs,
      tlsVerify: request.tlsVerify,
      addresses: target.addresses,
    });
  } catch (error) {
    throw new WebhookSendError(
      error instanceof Error ? error.message : "Échec de récupération du token OAuth2",
      { retryable: true, code: "oauth_token_unreachable" },
    );
  }
  if (response.status < 200 || response.status >= 300) {
    throw new WebhookSendError("Le fournisseur OAuth2 a refusé le token", {
      retryable: response.status >= 500 || response.status === 429,
      status: response.status,
      code: "oauth_token_rejected",
    });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(response.body.toString("utf8"));
  } catch {
    throw new WebhookSendError("Réponse OAuth2 illisible", {
      retryable: false,
      code: "oauth_token_invalid",
    });
  }
  const token =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).access_token
      : undefined;
  if (typeof token !== "string" || token === "") {
    throw new WebhookSendError("Token OAuth2 absent", {
      retryable: false,
      code: "oauth_token_missing",
    });
  }
  const expiresInRaw =
    parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>).expires_in
      : undefined;
  const expiresIn = typeof expiresInRaw === "number" && expiresInRaw > 0 ? expiresInRaw : 300;
  tokenCache.set(cacheKey, { token, expiresAt: Date.now() + expiresIn * 1000 });
  return token;
}

async function finalizeRequest(
  endpoint: WebhookEndpoint,
  request: WebhookHttpRequest,
): Promise<{ url: URL; headers: Record<string, string>; body: Buffer; method: string }> {
  const url = new URL(request.url);
  const headers = { ...request.headers };
  const body = request.body;
  const method = request.method;

  switch (endpoint.auth.type) {
    case "none":
      break;
    case "bearer":
      setHeader(headers, "Authorization", `Bearer ${endpoint.auth.token}`);
      break;
    case "basic":
      setHeader(
        headers,
        "Authorization",
        `Basic ${Buffer.from(`${endpoint.auth.username}:${endpoint.auth.password}`, "utf8").toString("base64")}`,
      );
      break;
    case "api_key_header":
      setHeader(headers, endpoint.auth.headerName, endpoint.auth.key);
      break;
    case "api_key_query":
      url.searchParams.set(endpoint.auth.paramName, endpoint.auth.key);
      break;
    case "oauth2_client_credentials":
      setHeader(headers, "Authorization", `Bearer ${await oauthToken(endpoint, request)}`);
      break;
    case "hmac": {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const bodyHash = createHash("sha256").update(body).digest("hex");
      const canonical = `${method}\n${url.toString()}\n${timestamp}\n${bodyHash}`;
      const signature = createHmac("sha256", endpoint.auth.secret).update(canonical).digest("hex");
      setHeader(headers, "X-Onir-Timestamp", timestamp);
      setHeader(headers, "X-Onir-Signature", `sha256=${signature}`);
      break;
    }
  }

  normalizeHeaders(headers, body, method);
  return { url, headers, body, method };
}

/** Client HTTP avec garde SSRF, redirections contrôlées et auth standard. */
export function httpWebhookSender(): WebhookSender {
  return {
    async send(endpoint, request): Promise<WebhookSendResult> {
      let finalized: Awaited<ReturnType<typeof finalizeRequest>>;
      try {
        finalized = await finalizeRequest(endpoint, request);
      } catch (error) {
        if (error instanceof WebhookSendError) throw error;
        throw new WebhookSendError(
          error instanceof Error ? error.message : "Préparation du webhook impossible",
          { retryable: false, code: "request_build_failed" },
        );
      }

      const started = Date.now();
      try {
        const response = await requestWithRedirects({
          url: finalized.url,
          method: finalized.method,
          headers: finalized.headers,
          body: finalized.body,
          timeoutMs: request.timeoutMs,
          tlsVerify: request.tlsVerify,
          followRedirects: request.followRedirects && endpoint.auth.type !== "hmac",
          allowInsecureHttp: endpoint.allowInsecureHttp,
          allowPrivateNetwork: request.allowPrivateNetwork,
        });
        return {
          status: response.status,
          body: responseBody(response.body, response.truncated),
          bodyTruncated: response.truncated,
          durationMs: Date.now() - started,
        };
      } catch (error) {
        if (error instanceof WebhookSendError) throw error;
        const message = error instanceof Error ? error.message : "Échec réseau du webhook";
        throw new WebhookSendError(message, {
          retryable: true,
          code: "network_error",
        });
      }
    },
  };
}
