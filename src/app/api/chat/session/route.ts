import { NextResponse } from "next/server";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { startConversation } from "@/application/use-cases/chat/start-conversation";
import { isChatLinkSurface } from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { isPlausibleTiming } from "@/lib/antispam";
import { chatSessionLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/session — démarrage d'une conversation (B037, lien standard).
 * Time-trap anti-spam (soumission instantanée ⇒ acceptation silencieuse)
 * puis `chatSessionLimiter` par IP + lien, puis `startConversation`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    if (!isPlausibleTiming(body.loadedAt, Date.now())) {
      return NextResponse.json({ ok: true });
    }

    const token = stringField(body, "token");
    const surface = stringField(body, "surface");
    if (token === undefined) {
      return NextResponse.json({ error: "Lien manquant" }, { status: 400 });
    }

    // Clé = IP + lien : chaque lien a son propre quota (le test de plusieurs
    // liens depuis une même IP ne s'accumule plus).
    const limit = chatSessionLimiter(`${clientIp(request)}:${token}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const conversations = pgConversationRepository(pool);
    const { conversation } = await startConversation(
      {
        organizations: pgOrganizationRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations,
        prospects: pgProspectRepository(pool),
        configs: pgChatbotConfigRepository(pool),
        ficheInstances: pgConversationFicheInstanceRepository(pool),
      },
      {
        token,
        visitor: {
          nom: stringField(body, "nom"),
          email: stringField(body, "email"),
          contacts: body.contacts,
        },
        consentement: body.consentement,
        ...(surface !== undefined && isChatLinkSurface(surface) ? { channel: surface } : {}),
      },
    );
    // Reprise : on renvoie l'historique éventuel pour ré-afficher le fil.
    const history = await conversations.listMessages(conversation.organizationId, conversation.id);
    return NextResponse.json(
      {
        conversationId: conversation.id,
        mode: conversation.interventionMode,
        messages: history.map((message) =>
          toPublicChatMessage(message, conversation.organizationId),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
