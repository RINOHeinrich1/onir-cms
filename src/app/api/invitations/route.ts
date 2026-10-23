import { NextResponse } from "next/server";
import type { InvitationRecord } from "@/application/ports/invitation-repository";
import { createInvitation } from "@/application/use-cases/invitations/create-invitation";
import { listInvitations } from "@/application/use-cases/invitations/list-invitations";
import { type InvitationStatus, invitationStatus } from "@/domain/entities/invitation";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { appUrl } from "@/lib/env";
import { errorResponse } from "../_lib/errors";
import { readJsonObject, stringField } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

function toDto(
  record: InvitationRecord,
): Omit<InvitationRecord, "token"> & { url: string | null; status: InvitationStatus } {
  const { token, ...invitation } = record;
  return {
    ...invitation,
    url: token === null ? null : `${appUrl()}/invitation/${token}`,
    status: invitationStatus(record),
  };
}

/** GET /api/invitations — invitations visibles par l'acteur. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "invitations:list");
    const invitations = await listInvitations(
      { invitations: pgInvitationRepository(getPool()) },
      actor,
    );
    return NextResponse.json({ invitations: invitations.map(toDto) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/invitations — crée un lien à usage unique. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "invitations:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const result = await createInvitation(
      {
        invitations: pgInvitationRepository(pool),
        organizations: pgOrganizationRepository(pool),
      },
      actor,
      {
        organizationId: stringField(body, "organizationId"),
        role: stringField(body, "role"),
      },
    );
    return NextResponse.json({ invitation: toDto(result.invitation) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
