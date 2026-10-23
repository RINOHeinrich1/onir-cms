import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { deleteUser } from "@/application/use-cases/users/delete-user";
import { updateUser } from "@/application/use-cases/users/update-user";
import { isRole, type Role } from "@/domain/entities/user";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../../_lib/errors";
import { booleanField, readJsonObject, stringField } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/users/[id] — rôle (membership) / mot de passe / actif (super-admin). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "users:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const roleValue = stringField(body, "role");
    let role: Role | undefined;
    if (roleValue !== undefined) {
      if (!isRole(roleValue)) {
        throw new ValidationError("Rôle invalide");
      }
      role = roleValue;
    }

    const actif = booleanField(body, "actif");
    const password = stringField(body, "password");

    const pool = getPool();
    const user = await updateUser(
      {
        users: pgUserRepository(pool),
        memberships: pgMembershipRepository(pool),
      },
      actor,
      id,
      {
        ...(role === undefined ? {} : { role }),
        ...(actif === undefined ? {} : { actif }),
        ...(password === undefined ? {} : { password }),
      },
    );
    return NextResponse.json({ user });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/users/[id] — retrait de la membership de l'organisation active (H5). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "users:delete");
    const { id } = await context.params;
    const pool = getPool();
    await deleteUser(
      {
        memberships: pgMembershipRepository(pool),
        sessions: pgSessionRepository(pool),
      },
      actor,
      id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
