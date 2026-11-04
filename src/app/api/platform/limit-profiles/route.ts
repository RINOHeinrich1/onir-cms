import { NextResponse } from "next/server";
import {
  createLimitProfile,
  listLimitProfiles,
} from "@/application/use-cases/organizations/manage-limit-profiles";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgLimitProfileRepository } from "@/infrastructure/db/limit-profile-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireSuperAdmin } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

function deps() {
  const pool = getPool();
  return {
    profiles: pgLimitProfileRepository(pool),
    grants: pgAiGrantRepository(pool),
  };
}

/** GET /api/platform/limit-profiles — profils de limites (super-admin). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "1";
    const profiles = await listLimitProfiles(deps(), actor, includeInactive);
    return NextResponse.json({ profiles });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/platform/limit-profiles — création (super-admin). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const profile = await createLimitProfile(deps(), actor, body);
    return NextResponse.json({ profile }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
