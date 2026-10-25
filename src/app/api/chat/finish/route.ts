import { NextResponse } from "next/server";
import { finishConversation } from "@/application/use-cases/chat/finish-conversation";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { renderMarkdownPdf } from "@/infrastructure/pdf/markdown-pdf";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat/finish — le visiteur termine la discussion (bouton « Terminer »).
 * L'IA propose les champs de la fiche, la validation tranche, la fiche est créée ;
 * on renvoie son Markdown et son PDF (base64) pour téléchargement immédiat.
 * Public (possession de l'identifiant de conversation), sans rôle dashboard.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    const conversationId = body ? stringField(body, "conversationId") : undefined;
    if (conversationId === undefined) {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    const pool = getPool();
    const finished = await finishConversation(
      {
        organizations: pgOrganizationRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
        prospects: pgProspectRepository(pool),
        fiches: pgFicheRepository(pool),
        templates: pgChatTemplateRepository(pool),
        attachments: pgAttachmentRepository(pool),
        ai: pgAiClientFactory(pool),
      },
      conversationId,
    );

    const pdf = await renderMarkdownPdf(finished.markdown, "Fiche — ONIR CMS");

    return NextResponse.json({ ...finished, pdfBase64: pdf.toString("base64") }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
