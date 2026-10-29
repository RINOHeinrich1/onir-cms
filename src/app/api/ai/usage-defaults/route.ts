import { NextResponse } from "next/server";
import { listAiUsageDefaults } from "@/application/use-cases/ai/manage-ai-usage";
import { aiUsageDeps } from "../../_lib/ai-usage";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:read");
    const defaults = await listAiUsageDefaults(aiUsageDeps(), actor);
    return NextResponse.json({ defaults });
  } catch (error) {
    return errorResponse(error);
  }
}
