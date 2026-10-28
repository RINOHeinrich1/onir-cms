import { NextResponse } from "next/server";
import { releaseConversation } from "@/application/use-cases/conversations/intervene";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { publishChatRealtime } from "@/lib/chat-realtime";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/conversations/[id]/release — rend la main à l'IA. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:intervene");
    const { id } = await context.params;
    const pool = getPool();
    const conversation = await releaseConversation(
      {
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
      },
      actor,
      id,
    );
    publishChatRealtime(id, { type: "state" });
    return NextResponse.json({ conversation });
  } catch (error) {
    return errorResponse(error);
  }
}
