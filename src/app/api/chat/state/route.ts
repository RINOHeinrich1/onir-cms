import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/errors";
import { detectUserState } from "@/application/use-cases/chat/detect-user-state";
import { NEUTRAL_DETECTION } from "@/domain/entities/user-state";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { chatStateLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/** Historique transmis à la classification (borné pour maîtriser coût/latence). */
const HISTORY_LIMIT = 20;

/**
 * POST /api/chat/state — capacité cœur « état du visiteur » (ADR-0020).
 * Corps `{ conversationId?, content }` → `{ state, confidence }`.
 * Route **générique** (chat par défaut, dashboard, templates via l'hôte) :
 * si `conversationId` est fourni, la conversation et son lien actif sont résolus
 * pour enrichir la classification de l'historique récent.
 * Rate limiting 30/5 min par IP+conversation (429 + Retry-After).
 * **Fail-open** : la détection ne renvoie jamais d'erreur de classification.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const content = stringField(body, "content");
    if (content === undefined || content.trim() === "") {
      return NextResponse.json({ error: "Message manquant" }, { status: 400 });
    }
    const conversationId = stringField(body, "conversationId");

    const limit = chatStateLimiter(`${clientIp(request)}:${conversationId ?? "anon"}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    let history: { role: string; content: string }[] = [];
    let target: {
      organizationId: string;
      aiProviderId: string | null;
      aiModel: string | null;
    } | null = null;
    if (conversationId !== undefined) {
      const conversations = pgConversationRepository(pool);
      const conversation = await conversations.findByIdPublic(conversationId);
      if (conversation === null) {
        throw new NotFoundError("Conversation introuvable");
      }
      const organizationId = conversation.organizationId;
      const organization = await pgOrganizationRepository(pool).findById(organizationId);
      if (organization === null || organization.suspendedAt !== null) {
        throw new NotFoundError("Conversation introuvable");
      }
      const link = await pgChatLinkRepository(pool).findById(organizationId, conversation.linkId);
      if (link === null || !link.actif) {
        throw new NotFoundError("Lien invalide ou révoqué");
      }
      target = {
        organizationId,
        aiProviderId: link.aiProviderId,
        aiModel: link.aiModel,
      };
      const messages = await conversations.listMessages(organizationId, conversationId);
      history = messages.slice(-HISTORY_LIMIT).map((message) => ({
        role: message.role === "user" ? "user" : "assistant",
        content: message.content,
      }));
    }

    const ai = await pgAiClientFactory(pool).optionalTarget(target);
    if (ai === null) {
      return NextResponse.json({ ...NEUTRAL_DETECTION });
    }
    const detection = await detectUserState({ ai }, { content, history });
    return NextResponse.json(detection);
  } catch (error) {
    return errorResponse(error);
  }
}
