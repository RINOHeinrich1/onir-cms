import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import type { WebhookDeliveryFilter } from "@/application/ports/webhook-delivery-repository";
import { listWebhookDeliveries } from "@/application/use-cases/webhooks/trigger-webhook";
import { isWebhookDeliveryStatus } from "@/domain/entities/webhook";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";
import { webhookExecutionDependencies } from "../../_lib/webhooks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  if (value === null || value.trim() === "") return null;
  if (!UUID.test(value.trim())) throw new ValidationError(`${name} invalide`);
  return value.trim();
}

/** GET /api/webhooks/deliveries — journal des livraisons (admin + marketeur). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:read");
    const params = new URL(request.url).searchParams;
    const statusRaw = params.get("status");
    const status =
      statusRaw === null
        ? null
        : isWebhookDeliveryStatus(statusRaw)
          ? statusRaw
          : (() => {
              throw new ValidationError("status invalide");
            })();
    const limitRaw = params.get("limit");
    const limit = limitRaw === null ? 100 : Number(limitRaw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new ValidationError("limit invalide");
    }
    const filter: WebhookDeliveryFilter = {
      endpointId: uuidParam(params, "endpointId"),
      ficheId: uuidParam(params, "ficheId"),
      status,
      limit,
    };
    const deliveries = await listWebhookDeliveries(webhookExecutionDependencies(), actor, filter);
    return NextResponse.json({ deliveries });
  } catch (error) {
    return errorResponse(error);
  }
}
