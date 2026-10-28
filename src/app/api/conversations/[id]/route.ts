import { NextResponse } from "next/server";
import { toDashboardChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import {
  archiveConversation,
  getConversation,
} from "@/application/use-cases/conversations/list-conversations";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/conversations/[id] — détail (transcript + contexte), US-CONVERS-001. */
/** PATCH /api/conversations/[id] — archivage / désarchivage (US-CONVERS-003). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null || typeof body.archivee !== "boolean") {
      return NextResponse.json({ error: "Champ 'archivee' (booléen) requis" }, { status: 400 });
    }
    await archiveConversation(
      { conversations: pgConversationRepository(getPool()) },
      actor,
      id,
      body.archivee,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:read");
    const { id } = await context.params;
    const pool = getPool();
    const detail = await getConversation(
      {
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
        links: pgChatLinkRepository(pool),
        prospects: pgProspectRepository(pool),
        fiches: pgFicheRepository(pool),
      },
      actor,
      id,
    );
    return NextResponse.json({
      ...detail,
      messages: detail.messages.map(toDashboardChatMessage),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
