import { NextResponse } from "next/server";
import {
  removeProviderModel,
  setProviderModelEnabled,
} from "@/application/use-cases/ai/manage-ai-models";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../../_lib/errors";
import { readJsonObject } from "../../../../../_lib/http";
import { requireRole } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; modelId: string }> };

const deps = () => {
  const pool = getPool();
  return {
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
    catalog: openAiModelCatalog,
  };
};

/** PATCH /api/ai/providers/[id]/models/[modelRowId] — activer/désactiver. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id, modelId } = await context.params;
    const body = await readJsonObject(request);
    if (body === null || typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "Champ enabled requis" }, { status: 400 });
    }
    const model = await setProviderModelEnabled(deps(), actor, id, modelId, body.enabled);
    return NextResponse.json({ model });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/ai/providers/[id]/models/[modelRowId] — supprime si non utilisé. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id, modelId } = await context.params;
    await removeProviderModel(deps(), actor, id, modelId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
