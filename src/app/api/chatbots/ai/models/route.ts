import { NextResponse } from "next/server";
import { listTemplateAiModels } from "@/application/use-cases/templates/list-template-ai-models";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAiUsageRepository } from "@/infrastructure/db/ai-usage-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/chatbots/ai/models — modèles de l'assistance (ADR-0060). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const pool = getPool();
    const result = await listTemplateAiModels(
      {
        providers: pgAiProviderRepository(pool),
        models: pgAiProviderModelRepository(pool),
        usage: pgAiUsageRepository(pool),
      },
      actor,
      "links:create",
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
