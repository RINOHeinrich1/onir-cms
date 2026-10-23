import { NextResponse } from "next/server";
import { draftTemplateDataFromConversation } from "@/application/use-cases/fiche/draft-fiche";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject, stringField } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/** POST /api/fiches/draft — pré-remplissage assisté depuis une conversation. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "project:write");
    const body = await readJsonObject(request);
    const conversationId = body ? stringField(body, "conversationId") : undefined;
    if (conversationId === undefined) {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const pool = getPool();
    const organizationId = actor.organizationId;
    if (organizationId === null) {
      return NextResponse.json({ error: "Aucune organisation active" }, { status: 403 });
    }
    const conversation = await pgConversationRepository(pool).findById(
      organizationId,
      conversationId,
    );
    if (conversation === null) {
      return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
    }
    const link = await pgChatLinkRepository(pool).findById(organizationId, conversation.linkId);
    if (link === null) {
      return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
    }
    const template = await pgChatTemplateRepository(pool).findVersion(
      organizationId,
      link.templateKey,
      link.templateVersion,
    );
    if (template === null) {
      return NextResponse.json({ error: "Modèle introuvable" }, { status: 404 });
    }
    const ai = await pgAiClientFactory(pool).forTarget({
      organizationId,
      aiProviderId: link.aiProviderId,
      aiModel: link.aiModel,
    });
    const draft = await draftTemplateDataFromConversation(
      {
        conversations: pgConversationRepository(pool),
        ai,
      },
      organizationId,
      conversationId,
      template.definition,
    );
    return NextResponse.json({ draft });
  } catch (error) {
    return errorResponse(error);
  }
}
