import { NextResponse } from "next/server";
import { setChatOperatorScope } from "@/application/use-cases/chat-operators/manage-chat-operator-scope";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../../_lib/errors";
import { readJsonObject } from "../../../../../_lib/http";
import { requireRole } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; userId: string }> };

/** PUT /api/organizations/[id]/members/[userId]/chat-scope — portée opérateur. */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "members:update");
    const { id, userId } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const scope = await setChatOperatorScope(
      {
        scopes: pgChatOperatorScopeRepository(pool),
        memberships: pgMembershipRepository(pool),
        links: pgChatLinkRepository(pool),
      },
      actor,
      id,
      userId,
      body,
    );
    return NextResponse.json({ scope });
  } catch (error) {
    return errorResponse(error);
  }
}
