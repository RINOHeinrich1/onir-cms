import { NextResponse } from "next/server";
import { getLinkAiOverrides, setLinkAiOverrides } from "@/application/use-cases/ai/manage-ai-usage";
import { aiUsageDeps } from "../../../_lib/ai-usage";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    const { id } = await context.params;
    const overrides = await getLinkAiOverrides(aiUsageDeps(), actor, id);
    return NextResponse.json({ overrides });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    await setLinkAiOverrides(aiUsageDeps(), actor, id, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
