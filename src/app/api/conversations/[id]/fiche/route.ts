import { NextResponse } from "next/server";
import { ChatbotBlockedError } from "@/application/errors";
import { recordConversationIncident } from "@/application/use-cases/conversations/conversation-incidents";
import { generateFicheFromConversation } from "@/application/use-cases/conversations/generate-fiche";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
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
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/conversations/[id]/fiche — génère la fiche d'une conversation
 * existante (US-CONVERS-002, admin/marketeur). Idempotent.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  let conversationId: string | null = null;
  try {
    const actor = await requireRole(request, "conversations:generate_fiche");
    const { id } = await context.params;
    conversationId = id;
    const pool = getPool();
    const result = await generateFicheFromConversation(
      {
        organizations: pgOrganizationRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
        prospects: pgProspectRepository(pool),
        fiches: pgFicheRepository(pool),
        templates: pgChatTemplateRepository(pool),
        attachments: pgAttachmentRepository(pool),
        ai: pgAiClientFactory(pool),
        conversationFields: pgConversationFieldRepository(pool),
        configs: pgChatbotConfigRepository(pool),
        ficheInstances: pgConversationFicheInstanceRepository(pool),
      },
      actor,
      id,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (conversationId !== null && !(error instanceof ChatbotBlockedError)) {
      const pool = getPool();
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
