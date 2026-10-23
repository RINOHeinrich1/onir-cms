import { NextResponse } from "next/server";
import { getProspect360 } from "@/application/use-cases/prospects/get-prospect-360";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/prospects/[id]/360 — vue complète d'un client (fiche 360). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "prospects:read");
    const { id } = await context.params;
    const pool = getPool();
    const fiche360 = await getProspect360(
      {
        prospects: pgProspectRepository(pool),
        fiches: pgFicheRepository(pool),
        links: pgChatLinkRepository(pool),
        conversations: pgConversationRepository(pool),
      },
      actor,
      id,
    );
    return NextResponse.json(fiche360);
  } catch (error) {
    return errorResponse(error);
  }
}
