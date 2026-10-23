import { NextResponse } from "next/server";
import { setProviderDefaultModel } from "@/application/use-cases/ai/manage-ai-models";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject } from "../../../../_lib/http";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PUT /api/ai/providers/[id]/default-model — définit le modèle par défaut. */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const provider = await setProviderDefaultModel(
      {
        providers: pgAiProviderRepository(pool),
        models: pgAiProviderModelRepository(pool),
        catalog: openAiModelCatalog,
      },
      actor,
      id,
      body,
    );
    return NextResponse.json({ provider });
  } catch (error) {
    return errorResponse(error);
  }
}
