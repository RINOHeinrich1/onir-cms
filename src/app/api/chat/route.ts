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
import { pgChatSearchSessionRepository } from "@/infrastructure/db/chat-search-session-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { pgFicheToolRepository } from "@/infrastructure/db/fiche-tool-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { publishChatEvent } from "@/lib/chat-events";
import { chatMessageLimiter } from "@/lib/chat-limiters";
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
    const ficheTools = pgFicheToolRepository(pool);
    const result = await sendMessage(
      {
        organizations: pgOrganizationRepository(pool),
        quotas: pgOrganizationAiQuotaRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
        prospects: pgProspectRepository(pool),
        connaissances: pgConnaissanceRepository(pool),
        medias: pgMediaRepository(pool),
        attachments: pgAttachmentRepository(pool),
        ai: pgAiClientFactory(pool),
        configs: pgChatbotConfigRepository(pool),
        ficheInstances: pgConversationFicheInstanceRepository(pool),
        ficheTools,
        ficheCollectes: pgFicheCollecteRepository(pool),
        searchSessions: pgChatSearchSessionRepository(pool),
      },
      { conversationId, content: body.content, attachmentIds: body.attachmentIds },
    );
    publishChatEvent(conversationId, { type: "message", message: result.userMessage });
    if (result.message !== null) {
      publishChatEvent(conversationId, { type: "message", message: result.message });
    }
    if (result.mode === "human") {
      publishChatEvent(conversationId, { type: "state" });
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
