import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/errors";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/** POST /api/chat/collection — état de la fiche active du formulaire. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    const conversationId = body === null ? undefined : stringField(body, "conversationId");
    if (conversationId === undefined) {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const pool = getPool();
    const conversation = await pgConversationRepository(pool).findByIdPublic(conversationId);
    if (conversation === null) throw new NotFoundError("Conversation introuvable");
    const link = await pgChatLinkRepository(pool).findById(
      conversation.organizationId,
      conversation.linkId,
    );
    if (link === null || !link.actif) throw new NotFoundError("Chatbot introuvable");
    const configId = link.currentConfigId ?? null;
    if (configId === null || configId === "") {
      return NextResponse.json({ activeFicheKey: null });
    }
    const config = await pgChatbotConfigRepository(pool).findById(
      conversation.organizationId,
      configId,
    );
    if (config === null) return NextResponse.json({ activeFicheKey: null });
    const instances = await pgConversationFicheInstanceRepository(pool).listByConversation(
      conversation.organizationId,
      conversation.id,
    );
    const active = instances.find((instance) => instance.status === "active");
    return NextResponse.json({
      activeFicheKey: active?.ficheKey ?? null,
      ficheKey: active?.ficheKey ?? null,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
