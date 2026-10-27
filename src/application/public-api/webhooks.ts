import { NotFoundError } from "@/application/errors";
import type {
  WebhookDeliveryFilter,
  WebhookDeliveryRepository,
} from "@/application/ports/webhook-delivery-repository";
import type { WebhookEndpointRepository } from "@/application/ports/webhook-endpoint-repository";
import { webhookDeliveryDto, webhookEndpointDto } from "@/application/public-api/dto";
import type { WebhookManagementDependencies } from "@/application/use-cases/webhooks/manage-webhooks";
import {
  createWebhookEndpointForOrganization,
  deleteWebhookEndpointForOrganization,
  updateWebhookEndpointForOrganization,
} from "@/application/use-cases/webhooks/manage-webhooks";
import type { WebhookExecutionDependencies } from "@/application/use-cases/webhooks/trigger-webhook";
import { retryWebhookDeliveryForOrganization } from "@/application/use-cases/webhooks/trigger-webhook";

export async function listWebhooksForApi(
  deps: { endpoints: WebhookEndpointRepository },
  organizationId: string,
  templateKey: string | null,
) {
  const endpoints = await deps.endpoints.list(organizationId, templateKey);
  return endpoints.filter((endpoint) => endpoint.deletedAt === null).map(webhookEndpointDto);
}

export async function getWebhookForApi(
  deps: { endpoints: WebhookEndpointRepository },
  organizationId: string,
  id: string,
) {
  const endpoint = await deps.endpoints.findById(organizationId, id);
  if (endpoint === null || endpoint.deletedAt !== null) {
    throw new NotFoundError("Webhook introuvable");
  }
  return webhookEndpointDto(endpoint);
}

export async function createWebhookForApi(
  deps: WebhookManagementDependencies,
  organizationId: string,
  createdBy: string | null,
  input: unknown,
) {
  return createWebhookEndpointForOrganization(deps, organizationId, createdBy, input);
}

export async function updateWebhookForApi(
  deps: WebhookManagementDependencies,
  organizationId: string,
  id: string,
  input: unknown,
) {
  return updateWebhookEndpointForOrganization(deps, organizationId, id, input);
}

export async function deleteWebhookForApi(
  deps: WebhookManagementDependencies,
  organizationId: string,
  id: string,
): Promise<void> {
  await deleteWebhookEndpointForOrganization(deps, organizationId, id);
}

export async function listWebhookDeliveriesForApi(
  deps: { deliveries: WebhookDeliveryRepository },
  organizationId: string,
  filter: WebhookDeliveryFilter,
) {
  const deliveries = await deps.deliveries.list(organizationId, filter);
  return deliveries.map(webhookDeliveryDto);
}

export async function getWebhookDeliveryForApi(
  deps: { deliveries: WebhookDeliveryRepository },
  organizationId: string,
  id: string,
) {
  const delivery = await deps.deliveries.findById(organizationId, id);
  if (delivery === null) throw new NotFoundError("Livraison introuvable");
  return webhookDeliveryDto(delivery);
}

export async function retryWebhookForApi(
  deps: WebhookExecutionDependencies,
  organizationId: string,
  id: string,
  triggeredBy: string | null,
) {
  return retryWebhookDeliveryForOrganization(deps, organizationId, id, triggeredBy);
}
