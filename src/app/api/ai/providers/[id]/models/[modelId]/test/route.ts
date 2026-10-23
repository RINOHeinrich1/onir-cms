import { NextResponse } from "next/server";
import { testProviderModel } from "@/application/use-cases/ai/manage-ai-models";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../../../_lib/errors";
import { readJsonObject } from "../../../../../../_lib/http";
import { requireRole } from "../../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; modelId: string }> };

/** POST /api/ai/providers/[id]/models/[modelRowId]/test — test réel ou chat de test. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id, modelId } = await context.params;
    const body = await readJsonObject(request);
    const pool = getPool();
    const result = await testProviderModel(
      {
        providers: pgAiProviderRepository(pool),
        models: pgAiProviderModelRepository(pool),
        catalog: openAiModelCatalog,
        aiFactory: pgAiClientFactory(pool),
      },
      actor,
      id,
      modelId,
      body ?? {},
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
