import { NextResponse } from "next/server";
import {
  storeConversationAttachment,
  toAttachmentDto,
} from "@/application/use-cases/attachments/manage-attachments";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { attachmentStorage } from "@/infrastructure/storage/attachments";
import { chatAttachmentLimiter } from "@/lib/chat-limiters";
import { errorResponse } from "../../_lib/errors";
import { clientIp } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/attachments — dépôt public d'une pièce jointe (ADR-0034).
 * multipart : `conversationId`, `fieldName`, `fichier`.
 * Aucun OCR / aucune IA : le fichier est stocké et rattaché au champ.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const conversationId = form.get("conversationId");
    const fieldName = form.get("fieldName");
    const fichier = form.get("fichier");
    if (typeof conversationId !== "string" || conversationId.trim() === "") {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    if (typeof fieldName !== "string" || fieldName.trim() === "") {
      return NextResponse.json({ error: "Champ manquant" }, { status: 400 });
    }
    if (!(fichier instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const limit = chatAttachmentLimiter(`${clientIp(request)}:${conversationId}`);
    if (limit.limited) {
      return NextResponse.json(
        { error: "Trop d'envois, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }

    const pool = getPool();
    const attachment = await storeConversationAttachment(
      {
        organizations: pgOrganizationRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
        templates: pgChatTemplateRepository(pool),
        attachments: pgAttachmentRepository(pool),
        storage: attachmentStorage(),
      },
      {
        conversationId: conversationId.trim(),
        fieldName: fieldName.trim(),
        fileName: fichier.name,
        data: Buffer.from(await fichier.arrayBuffer()),
      },
    );
    return NextResponse.json({ attachment: toAttachmentDto(attachment) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
