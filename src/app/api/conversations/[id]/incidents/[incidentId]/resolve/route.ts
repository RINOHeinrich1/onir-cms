import { NextResponse } from "next/server";
import { resolveConversationIncident } from "@/application/use-cases/conversations/conversation-incidents";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../../_lib/errors";
import { requireRole } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; incidentId: string }> };

/** POST /api/conversations/[id]/incidents/[incidentId]/resolve — clôture humaine. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:intervene");
    const { incidentId } = await context.params;
    const pool = getPool();
    const incident = await resolveConversationIncident(
      {
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
        incidents: pgConversationIncidentRepository(pool),
      },
      actor,
      incidentId,
    );
    return NextResponse.json({ incident });
  } catch (error) {
    return errorResponse(error);
  }
}
