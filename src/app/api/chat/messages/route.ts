import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/errors";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { chatPollLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * GET /api/chat/messages?conversationId=&after= — polling de secours du
 * visiteur (ADR-0043). L'UUID de conversation est la capability. Aucune
 * lecture inter-organisations ; une organisation suspendue renvoie 404.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const conversationId = url.searchParams.get("conversationId")?.trim() ?? "";
    if (conversationId === "") {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const limit = chatPollLimiter(`${clientIp(request)}:${conversationId}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop de requêtes, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const conversations = pgConversationRepository(pool);
    const conversation = await conversations.findByIdPublic(conversationId);
    if (conversation === null) {
      throw new NotFoundError("Conversation introuvable");
    }
    const organization = await pgOrganizationRepository(pool).findById(conversation.organizationId);
    if (organization === null || organization.suspendedAt !== null) {
      throw new NotFoundError("Conversation introuvable");
    }

    const afterParam = url.searchParams.get("after");
    const after =
      afterParam !== null && !Number.isNaN(new Date(afterParam).getTime())
        ? new Date(afterParam).toISOString()
        : null;
    const messages = await conversations.listMessagesAfter(
      conversation.organizationId,
      conversation.id,
      after,
    );
    return NextResponse.json({
      mode: conversation.interventionMode,
      messages: messages.map((message) =>
        toPublicChatMessage(message, conversation.organizationId),
      ),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
