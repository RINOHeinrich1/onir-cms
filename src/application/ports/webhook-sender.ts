import type { WebhookEndpoint, WebhookHttpMethod } from "@/domain/entities/webhook";

export type WebhookHttpRequest = {
  method: WebhookHttpMethod;
  url: string;
  headers: Record<string, string>;
  body: Buffer;
  contentType: string | null;
  timeoutMs: number;
  followRedirects: boolean;
  tlsVerify: boolean;
  allowPrivateNetwork: boolean;
};

export type WebhookSendResult = {
  status: number;
  body: string;
  bodyTruncated: boolean;
  durationMs: number;
};

export interface WebhookSender {
  send(endpoint: WebhookEndpoint, request: WebhookHttpRequest): Promise<WebhookSendResult>;
}

export class WebhookSendError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;
  readonly code: string;

  constructor(
    message: string,
    options: { retryable: boolean; status?: number | null; code?: string },
  ) {
    super(message);
    this.name = "WebhookSendError";
    this.retryable = options.retryable;
    this.status = options.status ?? null;
    this.code = options.code ?? "network_error";
  }
}
