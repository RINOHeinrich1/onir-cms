import { NextResponse } from "next/server";
import { selectChatMedia } from "@/application/use-cases/medias/select-chat-media";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { chatMediaLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/media — recherche asynchrone des médias pertinents (US-MEDIA-001).
 * Idempotent : le résultat (y compris vide) est mémorisé sur le message ;
 * un second appel renvoie le cache sans nouvel appel IA.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const conversationId = stringField(body, "conversationId");
    const messageId = stringField(body, "messageId");
    if (conversationId === undefined || messageId === undefined) {
      return NextResponse.json({ error: "Paramètres manquants" }, { status: 400 });
    }

    const limit = chatMediaLimiter(`${clientIp(request)}:${conversationId}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const result = await selectChatMedia(
      {
        organizations: pgOrganizationRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
        medias: pgMediaRepository(pool),
        ai: pgAiClientFactory(pool),
        configs: pgChatbotConfigRepository(pool),
      },
      { conversationId, messageId },
    );
    return NextResponse.json({ medias: result.medias });
  } catch (error) {
    return errorResponse(error);
  }
}
