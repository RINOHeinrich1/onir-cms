import { NextResponse } from "next/server";
import {
  addExistingUser,
  createUserInOrganization,
  listMembers,
} from "@/application/use-cases/organizations/manage-members";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject, stringField } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps() {
  const pool = getPool();
  return {
    organizations: pgOrganizationRepository(pool),
    memberships: pgMembershipRepository(pool),
    users: pgUserRepository(pool),
    sessions: pgSessionRepository(pool),
  };
}

/** GET /api/organizations/[id]/members — membres de l'organisation. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "members:list");
    const { id } = await context.params;
    const members = await listMembers(deps(), actor, id);
    return NextResponse.json({ members });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/organizations/[id]/members — rattache un utilisateur existant
 * (`email` sans mot de passe) ou crée un utilisateur dans l'organisation
 * (`email` + `password`).
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "members:create");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const email = stringField(body, "email");
    const role = stringField(body, "role");
    const password = stringField(body, "password");
    if (email === undefined || role === undefined) {
      return NextResponse.json({ error: "Email et rôle requis" }, { status: 400 });
    }

    const member =
      password === undefined
        ? await addExistingUser(deps(), actor, id, { email, role })
        : await createUserInOrganization(deps(), actor, id, {
            email,
            password,
            role,
            actif: body.actif,
          });
    return NextResponse.json({ member }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
