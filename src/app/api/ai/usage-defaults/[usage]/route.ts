import { NextResponse } from "next/server";
import { clearAiUsageDefault, setAiUsageDefault } from "@/application/use-cases/ai/manage-ai-usage";
import { aiUsageDeps } from "../../../_lib/ai-usage";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ usage: string }> };

export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { usage } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    await setAiUsageDefault(aiUsageDeps(), actor, usage, body);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { usage } = await context.params;
    await clearAiUsageDefault(aiUsageDeps(), actor, usage);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
