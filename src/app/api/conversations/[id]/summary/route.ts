import { NextResponse } from "next/server";
import {
  generateConversationSummary,
  getConversationSummary,
} from "@/application/use-cases/conversations/conversation-summary";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgConversationSummaryRepository } from "@/infrastructure/db/conversation-summary-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const deps = () => {
  const pool = getPool();
  return {
    conversations: pgConversationRepository(pool),
    operatorScopes: pgChatOperatorScopeRepository(pool),
    links: pgChatLinkRepository(pool),
    summaries: pgConversationSummaryRepository(pool),
    ai: pgAiClientFactory(pool),
  };
};

/** GET /api/conversations/[id]/summary — lecture (lecteur inclus). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:read");
    const { id } = await context.params;
    const summary = await getConversationSummary(deps(), actor, id);
    return NextResponse.json({ summary });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/conversations/[id]/summary — génère ou écrase le résumé. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:summarize");
    const { id } = await context.params;
    const body = (await readJsonObject(request)) ?? {};
    const summary = await generateConversationSummary(deps(), actor, id, {
      providerId: body.providerId,
      model: body.model,
    });
    return NextResponse.json({ summary }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
