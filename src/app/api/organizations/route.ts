import { NextResponse } from "next/server";
import { createOrganization } from "@/application/use-cases/organizations/create-organization";
import { listOrganizations } from "@/application/use-cases/organizations/list-organizations";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../_lib/errors";
import { readJsonObject, stringField } from "../_lib/http";
import { requireRole, requireSuperAdmin } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/organizations — super-admin : toutes ; sinon les memberships. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "organizations:list");
    const organizations = await listOrganizations(
      { organizations: pgOrganizationRepository(getPool()) },
      actor,
    );
    return NextResponse.json({ organizations });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/organizations — création (super-admin uniquement, ADR-0025 §5). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const organization = await createOrganization(
      {
        organizations: pgOrganizationRepository(pool),
        users: pgUserRepository(pool),
      },
      actor,
      { name: stringField(body, "name") },
    );
    return NextResponse.json({ organization }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
