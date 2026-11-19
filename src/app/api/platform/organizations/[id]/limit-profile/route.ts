import { NextResponse } from "next/server";
import { assignLimitProfile } from "@/application/use-cases/organizations/assign-limit-profile";
import { pgLimitProfileRepository } from "@/infrastructure/db/limit-profile-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject } from "../../../../_lib/http";
import { requirePlatformAdmin } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/platform/organizations/[id]/limit-profile — assigne un profil vivant. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requirePlatformAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const pool = getPool();
    const result = await assignLimitProfile(
      {
        profiles: pgLimitProfileRepository(pool),
        organizations: pgOrganizationRepository(pool),
      },
      actor,
      id,
      body,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
