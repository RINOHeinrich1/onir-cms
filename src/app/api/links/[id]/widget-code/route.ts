import { NextResponse } from "next/server";
import { buildWidgetSnippet, widgetEmbedUrl } from "@/application/use-cases/links/widget-code";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { decryptLinkToken } from "@/lib/link-crypto";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/links/[id]/widget-code — snippet copiable d'un lien widget. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    const { id } = await context.params;
    const organizationId = actor.organizationId;
    if (organizationId === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    const repository = pgChatLinkRepository(getPool());
    const link = await repository.findById(organizationId, id);
    if (link === null) {
      return NextResponse.json({ error: "Lien introuvable" }, { status: 404 });
    }
    if (link.surface !== "widget") {
      return NextResponse.json({ error: "Ce lien n'est pas un widget" }, { status: 400 });
    }
    const tokenEnc = await repository.getTokenEnc(organizationId, id);
    if (tokenEnc === null) {
      return NextResponse.json({ error: "Jeton indisponible" }, { status: 409 });
    }
    const token = decryptLinkToken(tokenEnc);
    return NextResponse.json({
      snippet: buildWidgetSnippet(token, link.widgetConfig.position ?? "bottom-right"),
      embedUrl: widgetEmbedUrl(token),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
