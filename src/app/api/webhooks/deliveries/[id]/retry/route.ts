import { NextResponse } from "next/server";
import { retryWebhookDelivery } from "@/application/use-cases/webhooks/trigger-webhook";
import { errorResponse } from "../../../../_lib/errors";
import { requireRole } from "../../../../_lib/require-user";
import { webhookExecutionDependencies } from "../../../../_lib/webhooks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/webhooks/deliveries/:id/retry — relance une livraison. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:trigger");
    const { id } = await context.params;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Livraison introuvable" }, { status: 404 });
    }
    const delivery = await retryWebhookDelivery(webhookExecutionDependencies(), actor, id);
    return NextResponse.json({ delivery }, { status: 202 });
  } catch (error) {
    return errorResponse(error);
  }
}
