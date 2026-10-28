import { NextResponse } from "next/server";
import { listConversationIncidents } from "@/application/use-cases/conversations/conversation-incidents";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/conversations/[id]/incidents — incidents ouverts sur la conversation. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:read");
    const { id } = await context.params;
    const pool = getPool();
    const incidents = await listConversationIncidents(
      {
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
        incidents: pgConversationIncidentRepository(pool),
      },
      actor,
      id,
    );
    return NextResponse.json({ incidents });
  } catch (error) {
    return errorResponse(error);
  }
}
