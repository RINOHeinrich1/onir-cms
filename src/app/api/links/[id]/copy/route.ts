import { NextResponse } from "next/server";
import { copyChatLink } from "@/application/use-cases/links/manage-chat-links";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/links/[id]/copy — URL stable d'une ligne (sans rotation).
 * Seule une ligne legacy (sans chiffré) provoque une régénération unique.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const { id } = await context.params;
    const copied = await copyChatLink({ links: pgChatLinkRepository(getPool()) }, actor, id);
    return NextResponse.json(copied);
  } catch (error) {
    return errorResponse(error);
  }
}
