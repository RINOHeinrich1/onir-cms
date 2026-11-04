import { NextResponse } from "next/server";
import {
  deleteLimitProfile,
  updateLimitProfile,
} from "@/application/use-cases/organizations/manage-limit-profiles";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgLimitProfileRepository } from "@/infrastructure/db/limit-profile-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps() {
  const pool = getPool();
  return {
    profiles: pgLimitProfileRepository(pool),
    grants: pgAiGrantRepository(pool),
  };
}

/** PATCH /api/platform/limit-profiles/[id] — modification (super-admin). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const profile = await updateLimitProfile(deps(), actor, id, body);
    return NextResponse.json({ profile });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/platform/limit-profiles/[id] — suppression (super-admin). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    await deleteLimitProfile(deps(), actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
