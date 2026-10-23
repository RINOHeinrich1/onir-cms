import { NextResponse } from "next/server";
import {
  clearOrganizationDefault,
  getOrganizationAiSettings,
  setOrganizationDefault,
} from "@/application/use-cases/ai/manage-ai-settings";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

const deps = () => {
  const pool = getPool();
  return {
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
  };
};

/** GET /api/ai/settings — défaut IA de l'organisation. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:read");
    const settings = await getOrganizationAiSettings(deps(), actor);
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT /api/ai/settings — définit fournisseur + modèle par défaut. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const settings = await setOrganizationDefault(deps(), actor, body);
    return NextResponse.json({ settings });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/ai/settings — retour au fallback legacy. */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    await clearOrganizationDefault(deps(), actor);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
