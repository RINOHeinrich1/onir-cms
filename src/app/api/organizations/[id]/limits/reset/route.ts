import { NextResponse } from "next/server";
import { resetOrganizationAiTokens } from "@/application/use-cases/organizations/manage-organization-ai-limits";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { requireSuperAdmin } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/organizations/[id]/limits/reset — reset manuel des compteurs IA. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const pool = getPool();
    const limits = await resetOrganizationAiTokens(
      { quotas: pgOrganizationAiQuotaRepository(pool) },
      actor,
      id,
    );
    return NextResponse.json({ limits });
  } catch (error) {
    return errorResponse(error);
  }
}
