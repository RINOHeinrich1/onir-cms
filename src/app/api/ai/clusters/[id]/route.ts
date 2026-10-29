import { NextResponse } from "next/server";
import { deleteAiCluster, updateAiCluster } from "@/application/use-cases/ai/manage-ai-usage";
import { aiUsageDeps } from "../../../_lib/ai-usage";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const cluster = await updateAiCluster(aiUsageDeps(), actor, id, body);
    return NextResponse.json({ cluster });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    await deleteAiCluster(aiUsageDeps(), actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
