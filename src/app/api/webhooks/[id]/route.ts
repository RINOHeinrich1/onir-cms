import { NextResponse } from "next/server";
import {
  deleteWebhookEndpoint,
  getWebhookEndpoint,
  updateWebhookEndpoint,
} from "@/application/use-cases/webhooks/manage-webhooks";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";
import { webhookManagementDependencies } from "../../_lib/webhooks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:update");
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Webhook introuvable" }, { status: 404 });
    const endpoint = await getWebhookEndpoint(webhookManagementDependencies(), actor, id);
    return NextResponse.json({ endpoint });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:update");
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Webhook introuvable" }, { status: 404 });
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const endpoint = await updateWebhookEndpoint(webhookManagementDependencies(), actor, id, body);
    return NextResponse.json({ endpoint });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:delete");
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Webhook introuvable" }, { status: 404 });
    await deleteWebhookEndpoint(webhookManagementDependencies(), actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
