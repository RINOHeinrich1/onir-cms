import { NextResponse } from "next/server";
import { createAiCluster, listAiClusters } from "@/application/use-cases/ai/manage-ai-usage";
import { aiUsageDeps } from "../../_lib/ai-usage";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:read");
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
    const clusters = await listAiClusters(aiUsageDeps(), actor, includeInactive);
    return NextResponse.json({ clusters });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const cluster = await createAiCluster(aiUsageDeps(), actor, body);
    return NextResponse.json({ cluster }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
