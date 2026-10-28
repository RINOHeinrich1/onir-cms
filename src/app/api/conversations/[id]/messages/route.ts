import { NextResponse } from "next/server";
import { toDashboardChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { replyAsOperator } from "@/application/use-cases/conversations/intervene";
import {
  type ConversationUpdatesDependencies,
  getConversationUpdates,
} from "@/application/use-cases/conversations/list-conversations";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { publishChatRealtime } from "@/lib/chat-realtime";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps(): ConversationUpdatesDependencies {
  const pool = getPool();
  return {
    conversations: pgConversationRepository(pool),
    operatorScopes: pgChatOperatorScopeRepository(pool),
  };
}

/** GET /api/conversations/[id]/messages?after= — polling opérateur. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:read");
    const { id } = await context.params;
    const after = new URL(request.url).searchParams.get("after");
    const updates = await getConversationUpdates(deps(), actor, id, after);
    return NextResponse.json({
      conversation: updates.conversation,
      messages: updates.messages.map(toDashboardChatMessage),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/conversations/[id]/messages — réponse d'un opérateur. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:intervene");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const result = await replyAsOperator(deps(), actor, id, body.content);
    publishChatRealtime(id, { type: "message", message: result.message });
    publishChatRealtime(id, { type: "state" });
    return NextResponse.json({
      message: toDashboardChatMessage(result.message),
      conversation: result.conversation,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
