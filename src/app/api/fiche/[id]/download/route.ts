import { renderFiche } from "@/application/use-cases/fiche/render-fiche";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { renderMarkdownPdf } from "@/infrastructure/pdf/markdown-pdf";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/fiche/[id]/download?format=pdf|md — téléchargement de la fiche
 * (RM-FICHE-002). `Content-Disposition: attachment` force le téléchargement.
 * Défaut : Markdown.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const actor = await requireRole(request, "project:read");
    const { id } = await context.params;
    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "md";
    const pool = getPool();

    const { fiche, markdown } = await renderFiche(
      {
        fiches: pgFicheRepository(pool),
        templates: pgChatTemplateRepository(pool),
        prospects: pgProspectRepository(pool),
        attachments: pgAttachmentRepository(pool),
      },
      actor,
      id,
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
