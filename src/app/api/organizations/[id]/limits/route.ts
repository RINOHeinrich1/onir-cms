import { NextResponse } from "next/server";
import {
  getOrganizationAiLimits,
  saveOrganizationAiLimits,
} from "@/application/use-cases/organizations/manage-organization-ai-limits";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAiUsageRepository } from "@/infrastructure/db/ai-usage-repository";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps() {
  const pool = getPool();
  return {
    quotas: pgOrganizationAiQuotaRepository(pool),
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
    usage: pgAiUsageRepository(pool),
  };
}

/** GET /api/organizations/[id]/limits — limites IA (super-admin). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const limits = await getOrganizationAiLimits(
      { quotas: pgOrganizationAiQuotaRepository(getPool()) },
      actor,
      id,
    );
    return NextResponse.json({ limits });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/organizations/[id]/limits — mise à jour partielle (super-admin). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const limits = await saveOrganizationAiLimits(deps(), actor, id, body);
    return NextResponse.json({ limits });
  } catch (error) {
    return errorResponse(error);
  }
}
