import { NextResponse } from "next/server";
import { switchOrganization } from "@/application/use-cases/organizations/switch-organization";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireUser } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/auth/switch-organization — bascule d'organisation (ADR-0025 §4).
 * L'identifiant cible est vérifié (membership ou super-admin, org non suspendue)
 * avant de mettre à jour la session serveur.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { actor, session } = await requireUser(request);
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const result = await switchOrganization(
      {
        organizations: pgOrganizationRepository(pool),
        memberships: pgMembershipRepository(pool),
        sessions: pgSessionRepository(pool),
        users: pgUserRepository(pool),
      },
      actor,
      session.id,
      { organizationId: body.organizationId },
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
