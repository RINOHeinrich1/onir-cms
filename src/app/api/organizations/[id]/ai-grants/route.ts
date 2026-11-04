import { NextResponse } from "next/server";
import {
  getOrganizationAiGrants,
  grantOrganizationAiAccess,
  revokeOrganizationAiAccess,
} from "@/application/use-cases/organizations/manage-ai-grants";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps() {
  const pool = getPool();
  return {
    grants: pgAiGrantRepository(pool),
    organizations: pgOrganizationRepository(pool),
  };
}

/** GET /api/organizations/[id]/ai-grants — catalogue + grants (super-admin). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const result = await getOrganizationAiGrants(deps(), actor, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/organizations/[id]/ai-grants — ajoute un partage (super-admin). */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const result = await grantOrganizationAiAccess(deps(), actor, id, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/organizations/[id]/ai-grants — retire un partage (super-admin). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const result = await revokeOrganizationAiAccess(deps(), actor, id, body);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
