import { WebhookSendError } from "@/application/ports/webhook-sender";
import { buildWebhookRequest } from "@/application/use-cases/webhooks/build-webhook-request";
import type { WebhookExecutionDependencies } from "@/application/use-cases/webhooks/trigger-webhook";
import type { FicheAttachment } from "@/domain/entities/attachment";
import type { Fiche } from "@/domain/entities/fiche";
import type { WebhookDelivery } from "@/domain/entities/webhook";
import type { FicheLifecycleEvent } from "@/domain/entities/webhook-event";

function retryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelayMs(baseMs: number, attempt: number): number {
  const exponential = baseMs * 2 ** Math.max(0, attempt - 1);
  const capped = Math.min(exponential, 15 * 60 * 1000);
  const jitter = Math.floor(Math.random() * Math.min(5000, Math.max(100, capped / 10)));
  return capped + jitter;
}

/**
 * Traite une livraison déjà réservée par le worker.
 * Le statut `running` et l'incrément de tentative sont posés par `claimNext`.
 */
export async function processWebhookDelivery(
  deps: WebhookExecutionDependencies,
  delivery: WebhookDelivery,
): Promise<WebhookDelivery> {
  const startedAt = delivery.startedAt ?? new Date().toISOString();
  const endpoint = await deps.endpoints.findById(delivery.organizationId, delivery.endpointId);
  if (endpoint === null) {
    const failed = await deps.deliveries.markFailed(delivery.id, {
      status: null,
      body: null,
      errorCode: "endpoint_missing",
      errorMessage: "Webhook introuvable",
      durationMs: null,
    });
    if (failed !== null) {
      await deps.deliveries
        .recordAttempt(delivery.id, {
          attempt: delivery.attempts,
          status: "failed",
          httpStatus: null,
          errorCode: "endpoint_missing",
          errorMessage: "Webhook introuvable",
          durationMs: null,
          startedAt,
          finishedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    }
    return failed ?? delivery;
  }

  let fiche: Fiche | null = null;
  let event: FicheLifecycleEvent | null = null;
  let attachmentsOverride: FicheAttachment[] | undefined;
  if (delivery.ficheEventId !== null) {
    event = await deps.events.findById(delivery.organizationId, delivery.ficheEventId);
    if (event === null) {
      const failed = await deps.deliveries.markFailed(delivery.id, {
        status: null,
        body: null,
        errorCode: "event_missing",
        errorMessage: "Événement webhook introuvable",
        durationMs: null,
      });
      return failed ?? delivery;
    }
    const payload = event.payload;
    fiche = {
      id: event.ficheId ?? event.ficheInstanceId ?? event.id,
      organizationId: event.organizationId,
      conversationId: event.conversationId,
      prospectId: payload.prospectId,
      createdBy: null,
      definition: payload.definition,
      data: payload.data,
      archivee: false,
      configId: event.configId,
      ficheKey: event.ficheKey,
      conversationFicheInstanceId: event.ficheInstanceId,
      chatLinkIds: event.chatLinkId === null ? [] : [event.chatLinkId],
      createdAt: event.occurredAt,
    };
    if (event.conversationId !== null) {
      const conversationAttachments = await deps.attachments.listByConversation(
        event.organizationId,
        event.conversationId,
      );
      attachmentsOverride = conversationAttachments.map((attachment) => ({
        ...attachment,
        ficheId: event?.ficheId ?? "",
      }));
    }
  } else if (delivery.ficheId !== null) {
    fiche = await deps.fiches.findById(delivery.organizationId, delivery.ficheId);
  }
  if (fiche === null) {
    const failed = await deps.deliveries.markFailed(delivery.id, {
      status: null,
      body: null,
      errorCode: "fiche_missing",
      errorMessage: "Fiche introuvable",
      durationMs: null,
    });
    if (failed !== null) {
      await deps.deliveries
        .recordAttempt(delivery.id, {
          attempt: delivery.attempts,
          status: "failed",
          httpStatus: null,
          errorCode: "fiche_missing",
          errorMessage: "Fiche introuvable",
          durationMs: null,
          startedAt,
          finishedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    }
    return failed ?? delivery;
  }

  try {
    const built = await buildWebhookRequest(deps, endpoint, fiche, attachmentsOverride);
    built.request.headers["Idempotency-Key"] = delivery.idempotencyKey;
    const result = await deps.sender.send(endpoint, built.request);
    const success = result.status >= 200 && result.status < 300;
    const finishedAt = new Date().toISOString();
    if (success) {
      const updated = await deps.deliveries.markSucceeded(delivery.id, {
        status: result.status,
        body: result.body,
        errorCode: null,
        errorMessage: null,
        durationMs: result.durationMs,
      });
      await deps.deliveries
        .recordAttempt(delivery.id, {
          attempt: delivery.attempts,
          status: "succeeded",
          httpStatus: result.status,
          errorCode: null,
          errorMessage: null,
          durationMs: result.durationMs,
          startedAt,
          finishedAt,
        })
        .catch(() => undefined);
      return updated ?? delivery;
    }

    const message = `Réponse HTTP ${result.status}`;
    const canRetry = retryableStatus(result.status) && delivery.attempts < endpoint.maxAttempts;
    if (canRetry) {
      const next = new Date(
        Date.now() + retryDelayMs(endpoint.retryBackoffMs, delivery.attempts),
      ).toISOString();
      const updated = await deps.deliveries.scheduleRetry(delivery.id, next);
      await deps.deliveries
        .recordAttempt(delivery.id, {
          attempt: delivery.attempts,
          status: "retry",
          httpStatus: result.status,
          errorCode: "http_error",
          errorMessage: message,
          durationMs: result.durationMs,
          startedAt,
          finishedAt,
        })
        .catch(() => undefined);
      return updated ?? delivery;
    }

    const updated = await deps.deliveries.markFailed(delivery.id, {
      status: result.status,
      body: result.body,
      errorCode: "http_error",
      errorMessage: message,
      durationMs: result.durationMs,
    });
    await deps.deliveries
      .recordAttempt(delivery.id, {
        attempt: delivery.attempts,
        status: "failed",
        httpStatus: result.status,
        errorCode: "http_error",
        errorMessage: message,
        durationMs: result.durationMs,
        startedAt,
        finishedAt,
      })
      .catch(() => undefined);
    return updated ?? delivery;
  } catch (error) {
    const sendError =
      error instanceof WebhookSendError
        ? error
        : new WebhookSendError(error instanceof Error ? error.message : "Échec du webhook", {
            retryable: false,
            code: "internal_error",
          });
    const canRetry = sendError.retryable && delivery.attempts < endpoint.maxAttempts;
    const finishedAt = new Date().toISOString();
    if (canRetry) {
      const next = new Date(
        Date.now() + retryDelayMs(endpoint.retryBackoffMs, delivery.attempts),
      ).toISOString();
      const updated = await deps.deliveries.scheduleRetry(delivery.id, next);
      await deps.deliveries
        .recordAttempt(delivery.id, {
          attempt: delivery.attempts,
          status: "retry",
          httpStatus: sendError.status,
          errorCode: sendError.code,
          errorMessage: sendError.message,
          durationMs: null,
          startedAt,
          finishedAt,
        })
        .catch(() => undefined);
      return updated ?? delivery;
    }
    const updated = await deps.deliveries.markFailed(delivery.id, {
      status: sendError.status,
      body: null,
      errorCode: sendError.code,
      errorMessage: sendError.message,
      durationMs: null,
    });
    await deps.deliveries
      .recordAttempt(delivery.id, {
        attempt: delivery.attempts,
        status: "failed",
        httpStatus: sendError.status,
        errorCode: sendError.code,
        errorMessage: sendError.message,
        durationMs: null,
        startedAt,
        finishedAt,
      })
      .catch(() => undefined);
    return updated ?? delivery;
  }
}
