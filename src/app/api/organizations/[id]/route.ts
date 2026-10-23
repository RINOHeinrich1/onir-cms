import { NextResponse } from "next/server";
import {
  reactivateOrganization,
  suspendOrganization,
} from "@/application/use-cases/organizations/suspend-organization";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireSuperAdmin } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/organizations/[id] — suspension / réactivation (super-admin). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const deps = { organizations: pgOrganizationRepository(getPool()) };
    const organization =
      body.suspended === false
        ? await reactivateOrganization(deps, actor, id)
        : await suspendOrganization(deps, actor, id);
    return NextResponse.json({ organization });
  } catch (error) {
    return errorResponse(error);
  }
}
