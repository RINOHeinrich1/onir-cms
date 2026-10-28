import { NextResponse } from "next/server";
import {
  AiNotConfiguredError,
  AiProviderUnavailableError,
  BadGatewayError,
} from "@/application/errors";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { sendMessage } from "@/application/use-cases/chat/send-message";
import { recordConversationIncident } from "@/application/use-cases/conversations/conversation-incidents";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { chatMessageLimiter } from "@/lib/chat-limiters";
import { publishChatRealtime } from "@/lib/chat-realtime";
import { errorResponse } from "../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat — envoi d'un message visiteur (B038, US-CHAT-001).
 * Renvoie le message de l'assistant et `mediaPending` : vrai si le client doit
 * lancer la recherche de médias (US-MEDIA-001).
 * Rate limiting 20/5 min par IP+conversation (429 + Retry-After).
 */
export async function POST(request: Request): Promise<NextResponse> {
  let conversationId: string | null = null;
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const parsedConversationId = stringField(body, "conversationId");
    if (parsedConversationId === undefined) {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    conversationId = parsedConversationId;

    const limit = chatMessageLimiter(`${clientIp(request)}:${conversationId}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de messages, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const result = await sendMessage(
      {
        organizations: pgOrganizationRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
        prospects: pgProspectRepository(pool),
        templates: pgChatTemplateRepository(pool),
        connaissances: pgConnaissanceRepository(pool),
        medias: pgMediaRepository(pool),
        attachments: pgAttachmentRepository(pool),
        ai: pgAiClientFactory(pool),
      },
      { conversationId, content: body.content, attachmentIds: body.attachmentIds },
    );
    publishChatRealtime(conversationId, { type: "message", message: result.userMessage });
    if (result.message !== null) {
      publishChatRealtime(conversationId, { type: "message", message: result.message });
    }
    if (result.mode === "human") {
      publishChatRealtime(conversationId, { type: "state" });
    }
    return NextResponse.json({
      userMessage: toPublicChatMessage(result.userMessage, result.organizationId),
      message:
        result.message === null ? null : toPublicChatMessage(result.message, result.organizationId),
      connaissances: result.connaissances,
      mediaPending: result.mediaPending,
      mode: result.mode,
    });
  } catch (error) {
    if (
      conversationId !== null &&
      (error instanceof BadGatewayError ||
        error instanceof AiNotConfiguredError ||
        error instanceof AiProviderUnavailableError)
    ) {
      const pool = getPool();
      await recordConversationIncident(
        {
          conversations: pgConversationRepository(pool),
          links: pgChatLinkRepository(pool),
          incidents: pgConversationIncidentRepository(pool),
        },
        { conversationId, kind: "ai_reply_failed", detail: error.message },
      );
    }
    return errorResponse(error);
  }
}
