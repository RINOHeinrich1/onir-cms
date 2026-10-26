import type {
  WebhookDelivery,
  WebhookDeliveryAttempt,
  WebhookDeliveryStatus,
  WebhookRequestSnapshot,
} from "@/domain/entities/webhook";

export type CreateWebhookDeliveryInput = {
  endpointId: string;
  ficheId: string | null;
  templateKey: string;
  templateVersion: number;
  isTest: boolean;
  replayOfId: string | null;
  idempotencyKey: string;
  requestSnapshot: WebhookRequestSnapshot | null;
  triggeredBy: string | null;
};

export type WebhookDeliveryFilter = {
  endpointId?: string | null;
  ficheId?: string | null;
  status?: WebhookDeliveryStatus | null;
  limit?: number;
};

export type WebhookDeliveryResult = {
  status: number | null;
  body: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
};

export interface WebhookDeliveryRepository {
  create(organizationId: string, input: CreateWebhookDeliveryInput): Promise<WebhookDelivery>;
  findById(organizationId: string, id: string): Promise<WebhookDelivery | null>;
  list(organizationId: string, filter?: WebhookDeliveryFilter): Promise<WebhookDelivery[]>;
  /** Réserve atomiquement la prochaine livraison due. */
  claimNext(): Promise<WebhookDelivery | null>;
  markSucceeded(id: string, result: WebhookDeliveryResult): Promise<WebhookDelivery | null>;
  markFailed(id: string, result: WebhookDeliveryResult): Promise<WebhookDelivery | null>;
  scheduleRetry(id: string, nextAttemptAt: string): Promise<WebhookDelivery | null>;
  recordAttempt(
    deliveryId: string,
    input: {
      attempt: number;
      status: string;
      httpStatus: number | null;
      errorCode: string | null;
      errorMessage: string | null;
      durationMs: number | null;
      startedAt: string | null;
      finishedAt: string | null;
    },
  ): Promise<void>;
  listAttempts(deliveryId: string): Promise<WebhookDeliveryAttempt[]>;
  /** Purge les livraisons plus anciennes que `days` jours (RGPD). */
  purgeOlderThan(days: number): Promise<number>;
}
