import { NextResponse } from "next/server";
import {
  addManualProviderModel,
  listProviderModels,
} from "@/application/use-cases/ai/manage-ai-models";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject } from "../../../../_lib/http";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const deps = () => {
  const pool = getPool();
  return {
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
    catalog: openAiModelCatalog,
  };
};

/** GET /api/ai/providers/[id]/models — catalogue local enregistré. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:read");
    const { id } = await context.params;
    const enabledOnly = new URL(request.url).searchParams.get("enabled") === "1";
    const items = await listProviderModels(deps(), actor, id, { enabledOnly });
    return NextResponse.json({
      models: items.filter((model) => model.enabled).map((model) => model.modelId),
      items,
      modelsAvailable: items.length > 0,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/ai/providers/[id]/models — ajout manuel d'un modèle. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const model = await addManualProviderModel(deps(), actor, id, body);
    return NextResponse.json({ model }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
