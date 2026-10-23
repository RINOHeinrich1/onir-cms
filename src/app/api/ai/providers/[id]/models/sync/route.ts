import { NextResponse } from "next/server";
import { syncProviderModels } from "@/application/use-cases/ai/manage-ai-models";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../../_lib/errors";
import { requireRole } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/ai/providers/[id]/models/sync — importe /models sans supprimer. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const pool = getPool();
    const result = await syncProviderModels(
      {
        providers: pgAiProviderRepository(pool),
        models: pgAiProviderModelRepository(pool),
        catalog: openAiModelCatalog,
      },
      actor,
      id,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
