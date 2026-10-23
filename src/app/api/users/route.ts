import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { createUser } from "@/application/use-cases/users/create-user";
import { listUsers } from "@/application/use-cases/users/list-users";
import { isRole } from "@/domain/entities/user";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../_lib/errors";
import { booleanField, readJsonObject, stringField } from "../_lib/http";
import { requireRole, requireSuperAdmin } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/users — membres de l'organisation active (ADR-0025 §5).
 * `?global=1` (super-admin) renvoie tous les comptes pour en rattacher un.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const global = new URL(request.url).searchParams.get("global") === "1";
    const pool = getPool();
    if (global) {
      await requireSuperAdmin(request);
      const users = await pgUserRepository(pool).listAll();
      return NextResponse.json({ users });
    }
    const actor = await requireRole(request, "users:list");
    const users = await listUsers(
      {
        users: pgUserRepository(pool),
        memberships: pgMembershipRepository(pool),
      },
      actor,
    );
    return NextResponse.json({ users });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/users — création dans l'organisation active (admin). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "users:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const email = stringField(body, "email");
    const password = stringField(body, "password");
    const role = stringField(body, "role");
    if (email === undefined || password === undefined || role === undefined) {
      return NextResponse.json({ error: "Email, mot de passe et rôle requis" }, { status: 400 });
    }
    if (!isRole(role)) {
      throw new ValidationError("Rôle invalide");
    }

    const actif = booleanField(body, "actif");
    const pool = getPool();
    const user = await createUser(
      {
        users: pgUserRepository(pool),
        memberships: pgMembershipRepository(pool),
      },
      actor,
      {
        email,
        password,
        role,
        ...(actif === undefined ? {} : { actif }),
      },
    );
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
