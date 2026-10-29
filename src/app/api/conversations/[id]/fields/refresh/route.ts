import { NextResponse } from "next/server";
import {
  type ConversationFieldsDependencies,
  refreshConversationFields,
} from "@/application/use-cases/conversations/conversation-fields";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationFieldRepository } from "@/infrastructure/db/conversation-field-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { readJsonObject } from "../../../../_lib/http";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps(): ConversationFieldsDependencies {
  const pool = getPool();
  return {
    conversations: pgConversationRepository(pool),
    operatorScopes: pgChatOperatorScopeRepository(pool),
    links: pgChatLinkRepository(pool),
    templates: pgChatTemplateRepository(pool),
    configs: pgChatbotConfigRepository(pool),
    ficheInstances: pgConversationFicheInstanceRepository(pool),
    attachments: pgAttachmentRepository(pool),
    fields: pgConversationFieldRepository(pool),
    ai: pgAiClientFactory(pool),
  };
}

/** POST /api/conversations/[id]/fields/refresh — extraction IA des champs. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:update_fields");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const ficheInstanceId =
      body !== null && typeof body.ficheInstanceId === "string" ? body.ficheInstanceId : null;
    return NextResponse.json(await refreshConversationFields(deps(), actor, id, ficheInstanceId));
  } catch (error) {
    return errorResponse(error);
  }
}
