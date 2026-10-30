import { NextResponse } from "next/server";
import { NotFoundError, ValidationError } from "@/application/errors";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { assertChatLinkAvailable } from "@/application/use-cases/chat/chat-link-quota";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { chatFallbackLimiter } from "@/lib/chat-limiters";
import { publishChatRealtime } from "@/lib/chat-realtime";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

type FallbackAction = "menu" | "select";

/**
 * POST /api/chat/fallback — menu et questions/réponses du secours heuristique
 * (ADR-0059). Public par possession du `conversationId`, comme /api/chat/finish.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const conversationId = stringField(body, "conversationId");
    if (conversationId === undefined) {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const action = stringField(body, "action") as FallbackAction | undefined;
    if (action !== "menu" && action !== "select") {
      throw new ValidationError("Action de fallback invalide");
    }

    const limit = chatFallbackLimiter(`${clientIp(request)}:${conversationId}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const conversations = pgConversationRepository(pool);
    const conversation = await conversations.findByIdPublic(conversationId);
    if (conversation === null) throw new NotFoundError("Conversation introuvable");

    const link = await pgChatLinkRepository(pool).findById(
      conversation.organizationId,
      conversation.linkId,
    );
    if (link === null || !link.actif) throw new NotFoundError("Chatbot introuvable");
    assertChatLinkAvailable(link);

    const config = await pgChatbotConfigRepository(pool).currentForLink(
      conversation.organizationId,
      conversation.linkId,
    );
    const fallback = config?.fallback;
    if (fallback === undefined || !fallback.enabled) {
      throw new NotFoundError("Fallback indisponible");
    }

    if (action === "menu") {
      return NextResponse.json({
        intro: fallback.intro,
        questions: fallback.questions.map((question) => ({
          id: question.id,
          label: question.label,
        })),
        showCollectionForm: fallback.showCollectionForm && (config?.fiches.length ?? 0) > 0,
      });
    }

    const questionId = stringField(body, "questionId");
    if (questionId === undefined) {
      throw new ValidationError("Question de fallback manquante");
    }
    const question = fallback.questions.find((entry) => entry.id === questionId);
    if (question === undefined) {
      throw new ValidationError("Question de fallback inconnue");
    }

    const message = await conversations.appendMessage(
      conversation.organizationId,
      conversation.id,
      "assistant",
      question.answer,
    );
    publishChatRealtime(conversation.id, { type: "message", message });
    return NextResponse.json({
      questionId: question.id,
      message: toPublicChatMessage(message, conversation.organizationId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
