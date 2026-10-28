import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/errors";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/links/[id]/config — configuration chatbot courante (ADR-0049). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    if (actor.organizationId === null) {
      throw new NotFoundError("Chatbot introuvable");
    }
    const { id } = await context.params;
    const pool = getPool();
    const link = await pgChatLinkRepository(pool).findById(actor.organizationId, id);
    if (link === null) {
      throw new NotFoundError("Chatbot introuvable");
    }
    const config = await pgChatbotConfigRepository(pool).currentForLink(actor.organizationId, id);
    return NextResponse.json({ config });
  } catch (error) {
    return errorResponse(error);
  }
}
