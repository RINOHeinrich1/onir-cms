import { NextResponse } from "next/server";
import { previewWebhook } from "@/application/use-cases/webhooks/trigger-webhook";
import { errorResponse } from "../../../../../_lib/errors";
import { requireRole } from "../../../../../_lib/require-user";
import { webhookExecutionDependencies } from "../../../../../_lib/webhooks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string; endpointId: string }> };

/** POST /api/fiches/:id/webhooks/:endpointId/preview — aperçu sans envoi. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:trigger");
    const { id, endpointId } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
    if (!UUID.test(endpointId)) {
      return NextResponse.json({ error: "Webhook introuvable" }, { status: 404 });
    }
    const preview = await previewWebhook(webhookExecutionDependencies(), actor, id, endpointId);
    return NextResponse.json(preview);
  } catch (error) {
    return errorResponse(error);
  }
}
