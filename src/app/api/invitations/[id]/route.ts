import { NextResponse } from "next/server";
import { revokeInvitation } from "@/application/use-cases/invitations/revoke-invitation";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** DELETE /api/invitations/[id] — révoque une invitation non acceptée. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "invitations:revoke");
    const { id } = await context.params;
    const invitation = await revokeInvitation(
      { invitations: pgInvitationRepository(getPool()) },
      actor,
      id,
    );
    const { token: _token, ...rest } = invitation;
    return NextResponse.json({ invitation: rest });
  } catch (error) {
    return errorResponse(error);
  }
}
