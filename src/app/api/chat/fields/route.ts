import { NextResponse } from "next/server";
import { NotFoundError, ValidationError } from "@/application/errors";
import { assertChatLinkAvailable } from "@/application/use-cases/chat/chat-link-quota";
import { submitChatCollection } from "@/application/use-cases/chat/submit-chat-collection";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
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

    const ficheInstanceIdRaw = body.ficheInstanceId;
    if (
      ficheInstanceIdRaw !== undefined &&
      (typeof ficheInstanceIdRaw !== "string" || ficheInstanceIdRaw.trim() === "")
    ) {
      throw new ValidationError("Instance de fiche invalide");
    }
    const ficheKeyRaw = body.ficheKey;
    if (
      ficheKeyRaw !== undefined &&
      (typeof ficheKeyRaw !== "string" || ficheKeyRaw.trim() === "")
    ) {
      throw new ValidationError("Fiche invalide");
    }
    const values: Record<string, unknown> = {};
    for (const [fieldName, rawValue] of Object.entries(rawValues)) {
      if (typeof rawValue === "string") {
        const value = rawValue.trim();
        if (value === "") continue;
        if (value.length > 4000) {
          throw new ValidationError(`Valeur trop longue pour ${fieldName}`);
        }
        values[fieldName] = value;
        continue;
      }
      if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        values[fieldName] = rawValue;
        continue;
      }
      if (rawValue !== null && typeof rawValue === "object") {
        const serialized = JSON.stringify(rawValue);
        if (serialized.length > 20000) {
          throw new ValidationError(`Valeur trop longue pour ${fieldName}`);
        }
        values[fieldName] = rawValue;
      }
    }
    if (Object.keys(values).length === 0) {
      throw new ValidationError("Aucun champ valide à enregistrer");
    }

    const result = await submitChatCollection(
      {
        conversations,
        links: pgChatLinkRepository(pool),
        configs: pgChatbotConfigRepository(pool),
        ficheInstances: pgConversationFicheInstanceRepository(pool),
        attachments: pgAttachmentRepository(pool),
      },
      {
        organizationId: conversation.organizationId,
        conversationId: conversation.id,
        ...(typeof ficheInstanceIdRaw === "string"
          ? { ficheInstanceId: ficheInstanceIdRaw.trim() }
          : {}),
        ...(typeof ficheKeyRaw === "string" ? { ficheKey: ficheKeyRaw.trim() } : {}),
        values,
      },
    );
    return NextResponse.json({
      ok: true,
      ficheInstanceId: result.ficheInstanceId,
      ficheKey: result.ficheKey,
      status: result.status,
      missingFields: result.missingFields,
      saved: Object.keys(values),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
