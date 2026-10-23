import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import {
  changeMemberRole,
  removeMember,
} from "@/application/use-cases/organizations/manage-members";
import { isRole } from "@/domain/entities/user";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject, stringField } from "../../../../_lib/http";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

function deps() {
  const pool = getPool();
  return {
    organizations: pgOrganizationRepository(pool),
    memberships: pgMembershipRepository(pool),
    users: pgUserRepository(pool),
    sessions: pgSessionRepository(pool),
  };
}

/** PATCH /api/organizations/[id]/members/[userId] — changement de rôle. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "members:update");
    const { id, userId } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const role = stringField(body, "role");
    if (role === undefined || !isRole(role)) {
      throw new ValidationError("Rôle invalide");
    }
    const member = await changeMemberRole(deps(), actor, id, userId, role);
    return NextResponse.json({ member });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/organizations/[id]/members/[userId] — retrait de membership. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "members:delete");
    const { id, userId } = await context.params;
    await removeMember(deps(), actor, id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
