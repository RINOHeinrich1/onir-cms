import { randomUUID } from "node:crypto";
import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, UnprocessableError, ValidationError } from "@/application/errors";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { FicheRepository } from "@/application/ports/fiche-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type {
  WebhookDeliveryFilter,
  WebhookDeliveryRepository,
} from "@/application/ports/webhook-delivery-repository";
import type { WebhookEndpointRepository } from "@/application/ports/webhook-endpoint-repository";
import type { WebhookSender } from "@/application/ports/webhook-sender";
import { buildWebhookRequest } from "@/application/use-cases/webhooks/build-webhook-request";
import { loadWebhookEndpoint } from "@/application/use-cases/webhooks/manage-webhooks";
import {
  toWebhookDeliveryDto,
  toWebhookEndpointPublicDto,
  type WebhookDeliveryDto,
  type WebhookEndpointPublicDto,
} from "@/application/use-cases/webhooks/webhook-dto";
import type { Fiche } from "@/domain/entities/fiche";
import type {
  WebhookDelivery,
  WebhookEndpoint,
  WebhookRequestSnapshot,
} from "@/domain/entities/webhook";
import { buildSampleData } from "@/domain/template-preview";

export type WebhookExecutionDependencies = {
  endpoints: WebhookEndpointRepository;
  deliveries: WebhookDeliveryRepository;
  templates: ChatTemplateRepository;
  fiches: FicheRepository;
  prospects: ProspectRepository;
  attachments: AttachmentRepository;
  storage: AttachmentStorage;
  sender: WebhookSender;
};

function assertEndpointUsable(endpoint: WebhookEndpoint): void {
  if (endpoint.deletedAt !== null) throw new NotFoundError("Webhook introuvable");
  if (!endpoint.enabled) throw new ValidationError("Ce webhook est désactivé");
}

async function loadFiche(
  deps: Pick<WebhookExecutionDependencies, "fiches">,
  actor: Actor,
  ficheId: string,
): Promise<Fiche> {
  assertCan(actor, "project:read");
  return loadFicheForOrganization(deps, organizationOf(actor), ficheId);
}

async function loadFicheForOrganization(
  deps: Pick<WebhookExecutionDependencies, "fiches">,
  organizationId: string,
  ficheId: string,
): Promise<Fiche> {
  const fiche = await deps.fiches.findById(organizationId, ficheId);
  if (fiche === null) throw new NotFoundError("Fiche introuvable");
  return fiche;
}

function assertSameTemplate(endpoint: WebhookEndpoint, fiche: Fiche): void {
  if (endpoint.templateKey !== fiche.templateKey) {
    throw new ValidationError("Le webhook ne cible pas le modèle de cette fiche");
  }
}

/** Endpoints actifs proposés depuis une fiche (admin + marketeur). */
export async function listWebhookEndpointsForFiche(
  deps: Pick<WebhookExecutionDependencies, "endpoints" | "fiches">,
  actor: Actor,
  ficheId: string,
): Promise<WebhookEndpointPublicDto[]> {
  assertCan(actor, "webhooks:trigger");
  const fiche = await loadFiche(deps, actor, ficheId);
  const endpoints = await deps.endpoints.list(organizationOf(actor), fiche.templateKey);
  return endpoints
    .filter((endpoint) => endpoint.enabled && endpoint.deletedAt === null)
    .map(toWebhookEndpointPublicDto);
}

export type WebhookPreview = {
  endpoint: WebhookEndpointPublicDto;
  snapshot: WebhookRequestSnapshot;
};

export async function previewWebhook(
  deps: WebhookExecutionDependencies,
  actor: Actor,
  ficheId: string,
  endpointId: string,
): Promise<WebhookPreview> {
  assertCan(actor, "webhooks:trigger");
  const organizationId = organizationOf(actor);
  const fiche = await loadFiche(deps, actor, ficheId);
  const endpoint = await loadWebhookEndpoint(deps, organizationId, endpointId);
  assertEndpointUsable(endpoint);
  assertSameTemplate(endpoint, fiche);
  const built = await buildWebhookRequest(deps, endpoint, fiche);
  return {
    endpoint: toWebhookEndpointPublicDto(endpoint),
    snapshot: built.snapshot,
  };
}

/** Crée une livraison asynchrone ; le worker envoie ensuite la requête. */
export async function triggerWebhook(
  deps: WebhookExecutionDependencies,
  actor: Actor,
  ficheId: string,
  endpointId: string,
): Promise<WebhookDeliveryDto> {
  assertCan(actor, "webhooks:trigger");
  const organizationId = organizationOf(actor);
  const fiche = await loadFiche(deps, actor, ficheId);
  const endpoint = await loadWebhookEndpoint(deps, organizationId, endpointId);
  assertEndpointUsable(endpoint);
  assertSameTemplate(endpoint, fiche);
  const built = await buildWebhookRequest(deps, endpoint, fiche);
  const delivery = await deps.deliveries.create(organizationId, {
    endpointId: endpoint.id,
    ficheId: fiche.id,
    templateKey: fiche.templateKey,
    templateVersion: fiche.templateVersion,
    isTest: false,
    replayOfId: null,
    idempotencyKey: randomUUID(),
    requestSnapshot: built.snapshot,
    triggeredBy: actor.id,
  });
  return toWebhookDeliveryDto(delivery);
}

function sampleFiche(
  endpoint: WebhookEndpoint,
  definition: Awaited<ReturnType<ChatTemplateRepository["currentVersion"]>>,
): Fiche {
  if (definition === null) throw new ValidationError("Modèle de raisonnement introuvable");
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    organizationId: endpoint.organizationId,
    conversationId: null,
    prospectId: null,
    createdBy: null,
    templateKey: endpoint.templateKey,
    templateVersion: definition.version,
    data: buildSampleData(definition.definition.fields),
    plateformes: [],
    description: "",
    budget: "",
    duree: "",
    contact: "",
    statut: null,
    contraintesTechno: "",
    lienDocSpec: "",
    archivee: false,
    createdAt: now,
  };
}

export type TestWebhookResult = {
  delivery: WebhookDeliveryDto;
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
};

/** Test admin synchrone : crée une livraison is_test puis renvoie son résultat. */
export async function testWebhook(
  deps: WebhookExecutionDependencies,
  actor: Actor,
  endpointId: string,
  ficheId: string | null,
): Promise<TestWebhookResult> {
  assertCan(actor, "webhooks:test");
  const organizationId = organizationOf(actor);
  const endpoint = await loadWebhookEndpoint(deps, organizationId, endpointId);
  assertEndpointUsable(endpoint);
  const fiche =
    ficheId === null
      ? sampleFiche(
          endpoint,
          await deps.templates.currentVersion(organizationId, endpoint.templateKey),
        )
      : await loadFiche(deps, actor, ficheId);
  assertSameTemplate(endpoint, fiche);
  const built = await buildWebhookRequest(deps, endpoint, fiche);
  let delivery = await deps.deliveries.create(organizationId, {
    endpointId: endpoint.id,
    ficheId: ficheId,
    templateKey: fiche.templateKey,
    templateVersion: fiche.templateVersion,
    isTest: true,
    replayOfId: null,
    idempotencyKey: randomUUID(),
    requestSnapshot: built.snapshot,
    triggeredBy: actor.id,
  });
  const startedAt = new Date().toISOString();
  try {
    const result = await deps.sender.send(endpoint, built.request);
    const success = result.status >= 200 && result.status < 300;
    const updated = success
      ? await deps.deliveries.markSucceeded(delivery.id, {
          status: result.status,
          body: result.body,
          errorCode: null,
          errorMessage: null,
          durationMs: result.durationMs,
        })
      : await deps.deliveries.markFailed(delivery.id, {
          status: result.status,
          body: result.body,
          errorCode: "http_error",
          errorMessage: `Réponse HTTP ${result.status}`,
          durationMs: result.durationMs,
        });
    delivery = updated ?? delivery;
    await deps.deliveries.recordAttempt(delivery.id, {
      attempt: 1,
      status: success ? "succeeded" : "failed",
      httpStatus: result.status,
      errorCode: success ? null : "http_error",
      errorMessage: success ? null : `Réponse HTTP ${result.status}`,
      durationMs: result.durationMs,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    const final = await deps.deliveries.findById(organizationId, delivery.id);
    return {
      delivery: toWebhookDeliveryDto(final ?? delivery),
      responseStatus: result.status,
      responseBody: result.body,
      errorMessage: success ? null : `Réponse HTTP ${result.status}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Échec du test";
    const updated = await deps.deliveries.markFailed(delivery.id, {
      status: null,
      body: null,
      errorCode: "send_error",
      errorMessage: message,
      durationMs: null,
    });
    delivery = updated ?? delivery;
    await deps.deliveries.recordAttempt(delivery.id, {
      attempt: 1,
      status: "failed",
      httpStatus: null,
      errorCode: "send_error",
      errorMessage: message,
      durationMs: null,
      startedAt,
      finishedAt: new Date().toISOString(),
    });
    return {
      delivery: toWebhookDeliveryDto(delivery),
      responseStatus: null,
      responseBody: null,
      errorMessage: message,
    };
  }
}

export async function listWebhookDeliveries(
  deps: WebhookExecutionDependencies,
  actor: Actor,
  filter: WebhookDeliveryFilter,
): Promise<WebhookDeliveryDto[]> {
  assertCan(actor, "webhooks:read");
  const deliveries = await deps.deliveries.list(organizationOf(actor), filter);
  return deliveries.map(toWebhookDeliveryDto);
}

export async function getWebhookDelivery(
  deps: WebhookExecutionDependencies,
  actor: Actor,
  id: string,
): Promise<WebhookDeliveryDto> {
  assertCan(actor, "webhooks:read");
  const delivery = await deps.deliveries.findById(organizationOf(actor), id);
  if (delivery === null) throw new NotFoundError("Livraison introuvable");
  return toWebhookDeliveryDto(delivery);
}

export async function retryWebhookDelivery(
  deps: WebhookExecutionDependencies,
  actor: Actor,
  id: string,
): Promise<WebhookDeliveryDto> {
  assertCan(actor, "webhooks:trigger");
  return retryWebhookDeliveryForOrganization(deps, organizationOf(actor), id, actor.id);
}

export async function retryWebhookDeliveryForOrganization(
  deps: WebhookExecutionDependencies,
  organizationId: string,
  id: string,
  triggeredBy: string | null,
): Promise<WebhookDeliveryDto> {
  const previous = await deps.deliveries.findById(organizationId, id);
  if (previous === null) throw new NotFoundError("Livraison introuvable");
  if (previous.isTest) throw new UnprocessableError("Un test ne peut pas être relancé ainsi");
  if (previous.ficheId === null) throw new UnprocessableError("Fiche d'origine introuvable");
  const fiche = await loadFicheForOrganization(deps, organizationId, previous.ficheId);
  const endpoint = await loadWebhookEndpoint(deps, organizationId, previous.endpointId);
  assertEndpointUsable(endpoint);
  assertSameTemplate(endpoint, fiche);
  const built = await buildWebhookRequest(deps, endpoint, fiche);
  const delivery = await deps.deliveries.create(organizationId, {
    endpointId: endpoint.id,
    ficheId: fiche.id,
    templateKey: fiche.templateKey,
    templateVersion: fiche.templateVersion,
    isTest: false,
    replayOfId: previous.id,
    idempotencyKey: randomUUID(),
    requestSnapshot: built.snapshot,
    triggeredBy,
  });
  return toWebhookDeliveryDto(delivery);
}

export type WebhookDeliveryInternal = WebhookDelivery;
