import { NextResponse } from "next/server";
import { NotFoundError, ValidationError } from "@/application/errors";
import { assertChatLinkAvailable } from "@/application/use-cases/chat/chat-link-quota";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFieldRepository } from "@/infrastructure/db/conversation-field-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { chatFallbackLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/fields — saisie structurée des champs de la fiche active
 * depuis le formulaire du template (capacité `modelForm`, ADR-0059).
 * Public par possession du `conversationId`.
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
    const rawValues = body.values;
    if (rawValues === null || typeof rawValues !== "object" || Array.isArray(rawValues)) {
      throw new ValidationError("Valeurs du formulaire manquantes");
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
    if (conversation.statut === "finalisee") {
      throw new ValidationError("Conversation déjà terminée");
    }

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
    const fiche = config?.fiches[0];
    if (fiche === undefined) throw new NotFoundError("Fiche de collecte introuvable");

    const allowed = new Set(
      fiche.fields.filter((field) => field.type !== "file").map((field) => field.name),
    );
    const entries: { fieldName: string; value: unknown; source: "manual"; updatedBy: null }[] = [];
    for (const [fieldName, rawValue] of Object.entries(rawValues)) {
      if (!allowed.has(fieldName)) continue;
      if (typeof rawValue !== "string") continue;
      const value = rawValue.trim();
      if (value === "") continue;
      if (value.length > 4000) {
        throw new ValidationError(`Valeur trop longue pour ${fieldName}`);
      }
      entries.push({ fieldName, value, source: "manual", updatedBy: null });
    }
    if (entries.length === 0) throw new ValidationError("Aucun champ valide à enregistrer");

    await pgConversationFieldRepository(pool).upsertManual(
      conversation.organizationId,
      conversation.id,
      entries,
    );
    return NextResponse.json({ ok: true, saved: entries.map((entry) => entry.fieldName) });
  } catch (error) {
    return errorResponse(error);
  }
}
