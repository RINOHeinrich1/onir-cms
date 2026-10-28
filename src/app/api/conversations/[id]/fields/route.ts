import { NextResponse } from "next/server";
import {
  type ConversationFieldsDependencies,
  getConversationFields,
  updateConversationFields,
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
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

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

/** GET /api/conversations/[id]/fields — état des informations à collecter. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:read");
    const { id } = await context.params;
    return NextResponse.json(await getConversationFields(deps(), actor, id));
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/conversations/[id]/fields — édition humaine des champs. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:update_fields");
    const body = await readJsonObject(request);
    if (body === null || body.values === null || typeof body.values !== "object") {
      return NextResponse.json({ error: "Valeurs manquantes" }, { status: 400 });
    }
    const { id } = await context.params;
    return NextResponse.json(
      await updateConversationFields(deps(), actor, id, {
        values: body.values as Record<string, unknown>,
        ficheInstanceId: typeof body.ficheInstanceId === "string" ? body.ficheInstanceId : null,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
