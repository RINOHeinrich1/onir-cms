import { readActor } from "@/application/public-api/principal";
import { renderFiche } from "@/application/use-cases/fiche/render-fiche";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { renderMarkdownPdf } from "@/infrastructure/pdf/markdown-pdf";
import { withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("fiches:read", async ({ request, requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const format = new URL(request.url).searchParams.get("format");
  const pool = getPool();
  const { fiche, markdown } = await renderFiche(
    {
      fiches: pgFicheRepository(pool),
      templates: pgChatTemplateRepository(pool),
      prospects: pgProspectRepository(pool),
      attachments: pgAttachmentRepository(pool),
    },
    readActor(principal),
    id,
  );
  const headers = {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
  };
  if (format === "pdf") {
    const pdf = await renderMarkdownPdf(markdown, "Fiche — ONIR CMS");
    return new Response(new Uint8Array(pdf), {
      headers: {
        ...headers,
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="fiche-${fiche.id.slice(0, 8)}.pdf"`,
      },
    });
  }
  return new Response(markdown, {
    headers: {
      ...headers,
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="fiche-${fiche.id.slice(0, 8)}.md"`,
    },
  });
});
