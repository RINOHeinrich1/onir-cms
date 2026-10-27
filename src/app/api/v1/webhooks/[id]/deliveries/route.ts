import { ValidationError } from "@/application/errors";
import type { WebhookDeliveryFilter } from "@/application/ports/webhook-delivery-repository";
import { listWebhookDeliveriesForApi } from "@/application/public-api/webhooks";
import { isWebhookDeliveryStatus } from "@/domain/entities/webhook";
import { webhookReadDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { parseLimit, parseUuid, queryString, requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

function filter(request: Request, endpointId: string): WebhookDeliveryFilter {
  const params = new URL(request.url).searchParams;
  const status = queryString(params, "status");
  if (status !== null && !isWebhookDeliveryStatus(status)) {
    throw new ValidationError("status invalide");
  }
  return {
    endpointId,
    ficheId: parseUuid(params, "ficheId"),
    status: status === null ? null : status,
    limit: parseLimit(params, 100),
  };
}

export const GET = withApiKey(
  "webhooks:read",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const deliveries = await listWebhookDeliveriesForApi(
      webhookReadDeps(),
      principal.organizationId,
      filter(request, id),
    );
    return apiJson({ data: deliveries }, requestId);
  },
);
