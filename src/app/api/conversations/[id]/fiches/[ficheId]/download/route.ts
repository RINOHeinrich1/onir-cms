import { renderConversationFiche } from "@/application/use-cases/fiche/render-fiche";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { renderMarkdownPdf } from "@/infrastructure/pdf/markdown-pdf";
import { errorResponse } from "../../../../../_lib/errors";
import { requireRole } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; ficheId: string }> };

/**
 * GET /api/conversations/[id]/fiches/[ficheId]/download?format=pdf|md
 * Téléchargement d'une fiche depuis la conversation (opérateur, ADR-0043).
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const actor = await requireRole(request, "conversations:generate_fiche");
    const { id, ficheId } = await context.params;
    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "md";
    const pool = getPool();
    const { fiche, markdown } = await renderConversationFiche(
      {
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
        fiches: pgFicheRepository(pool),
        templates: pgChatTemplateRepository(pool),
        prospects: pgProspectRepository(pool),
        attachments: pgAttachmentRepository(pool),
      },
      actor,
      id,
      ficheId,
    );
    const shortId = fiche.id.slice(0, 8);
    if (format === "pdf") {
      const pdf = await renderMarkdownPdf(markdown, "Fiche — ONIR CMS");
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="fiche-${shortId}.pdf"`,
        },
      });
    }
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="fiche-${shortId}.md"`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
