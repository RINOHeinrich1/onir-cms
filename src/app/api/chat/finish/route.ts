import { NextResponse } from "next/server";
import { ChatbotBlockedError } from "@/application/errors";
import { finishConversation } from "@/application/use-cases/chat/finish-conversation";
import { recordConversationIncident } from "@/application/use-cases/conversations/conversation-incidents";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationFieldRepository } from "@/infrastructure/db/conversation-field-repository";
import { pgConversationIncidentRepository } from "@/infrastructure/db/conversation-incident-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { renderMarkdownPdf } from "@/infrastructure/pdf/markdown-pdf";
import { publishChatRealtime } from "@/lib/chat-realtime";
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
  let conversationId: string | null = null;
  try {
    const body = await readJsonObject(request);
    const parsedConversationId = body ? stringField(body, "conversationId") : undefined;
    if (parsedConversationId === undefined) {
      return NextResponse.json({ error: "Conversation manquante" }, { status: 400 });
    }
    conversationId = parsedConversationId;
    const abandonPending = body?.abandonPending === true;
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
        conversationFields: pgConversationFieldRepository(pool),
        configs: pgChatbotConfigRepository(pool),
        ficheInstances: pgConversationFicheInstanceRepository(pool),
      },
      conversationId,
      { abandonPending },
    );

    const fiches = await Promise.all(
      finished.fiches.map(async (entry) => {
        const pdf = await renderMarkdownPdf(entry.markdown, "Fiche — ONIR CMS");
        return {
          fiche: entry.fiche,
          markdown: entry.markdown,
          pdfBase64: pdf.toString("base64"),
        };
      }),
    );
    publishChatRealtime(conversationId, { type: "state" });

    // `fiches` est la réponse de référence (0..N) ; les champs de premier
    // niveau restent exposés pour les clients historiques (première fiche).
    const first = fiches[0];
    return NextResponse.json(
      {
        fiches,
        outcome: finished.outcome,
        ...(first === undefined
          ? {}
          : { fiche: first.fiche, markdown: first.markdown, pdfBase64: first.pdfBase64 }),
      },
      { status: 201 },
    );
  } catch (error) {
    if (conversationId !== null && !(error instanceof ChatbotBlockedError)) {
      const pool = getPool();
      const conversations = pgConversationRepository(pool);
      const conversation = await conversations.findByIdPublic(conversationId).catch(() => null);
      if (conversation !== null) {
        await conversations
          .setOutcome?.(conversation.organizationId, conversation.id, "erreur")
          .catch(() => undefined);
      }
      await recordConversationIncident(
        {
          conversations: pgConversationRepository(pool),
          links: pgChatLinkRepository(pool),
          incidents: pgConversationIncidentRepository(pool),
        },
        {
          conversationId,
          kind: "fiche_generation_failed",
          detail: error instanceof Error ? error.message : "Erreur inconnue",
        },
      );
    }
    return errorResponse(error);
  }
}
