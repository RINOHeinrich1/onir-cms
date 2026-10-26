import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { testWebhook } from "@/application/use-cases/webhooks/trigger-webhook";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";
import { webhookExecutionDependencies } from "../../../_lib/webhooks";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/webhooks/:id/test — test admin synchrone. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "webhooks:test");
    const { id } = await context.params;
    if (!UUID.test(id)) return NextResponse.json({ error: "Webhook introuvable" }, { status: 404 });
    const body = await readJsonObject(request);
    const ficheIdRaw = body?.ficheId;
    if (ficheIdRaw !== undefined && ficheIdRaw !== null && typeof ficheIdRaw !== "string") {
      throw new ValidationError("ficheId invalide");
    }
    if (typeof ficheIdRaw === "string" && !UUID.test(ficheIdRaw)) {
      throw new ValidationError("ficheId invalide");
    }
    const result = await testWebhook(
      webhookExecutionDependencies(),
      actor,
      id,
      typeof ficheIdRaw === "string" ? ficheIdRaw : null,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
