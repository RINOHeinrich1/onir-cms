import { NextResponse } from "next/server";
import { setOrganizationExtraction } from "@/application/use-cases/ai/manage-ai-settings";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

const deps = () => {
  const pool = getPool();
  return {
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
  };
};

/** PUT /api/ai/settings/extraction — modèle d'extraction et secours. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const settings = await setOrganizationExtraction(deps(), actor, body);
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}
