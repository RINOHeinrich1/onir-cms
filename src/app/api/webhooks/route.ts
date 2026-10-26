import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { webhookManagementDependencies } from "@/app/api/_lib/webhooks";
import {
  createWebhookEndpoint,
  listWebhookEndpoints,
} from "@/application/use-cases/webhooks/manage-webhooks";

export const dynamic = "force-dynamic";

/** GET /api/webhooks — endpoints de l'organisation (admin). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:update");
    const templateKey = new URL(request.url).searchParams.get("templateKey");
    const endpoints = await listWebhookEndpoints(
      webhookManagementDependencies(),
      actor,
      templateKey === null || templateKey.trim() === "" ? null : templateKey.trim(),
    );
    return NextResponse.json({ endpoints });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/webhooks — crée un endpoint (admin). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const endpoint = await createWebhookEndpoint(webhookManagementDependencies(), actor, body);
    return NextResponse.json({ endpoint }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
