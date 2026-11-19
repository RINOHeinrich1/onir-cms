import { NextResponse } from "next/server";
import { suggestOperatorReply } from "@/application/use-cases/conversations/suggest-operator-reply";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getChatbotHotSet } from "@/infrastructure/cache/chatbot-hot-set";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const deps = () => {
  const pool = getPool();
  return {
    conversations: pgConversationRepository(pool),
    operatorScopes: pgChatOperatorScopeRepository(pool),
    links: pgChatLinkRepository(pool),
    configs: pgChatbotConfigRepository(pool),
    hotSet: getChatbotHotSet() ?? undefined,
    prospects: pgProspectRepository(pool),
    ficheInstances: pgConversationFicheInstanceRepository(pool),
    ai: pgAiClientFactory(pool),
  };
};

/** POST /api/conversations/[id]/suggest-reply — brouillon IA, jamais envoyé. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:intervene");
    const { id } = await context.params;
    const result = await suggestOperatorReply(deps(), actor, id);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
