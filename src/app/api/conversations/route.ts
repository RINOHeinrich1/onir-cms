import { NextResponse } from "next/server";
import { listConversations } from "@/application/use-cases/conversations/list-conversations";
import { parseConversationFilter } from "@/domain/entities/chat";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/conversations?filtre=en_cours|finalisees|toutes — liste (US-CONVERS-001). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "conversations:list");
    const params = new URL(request.url).searchParams;
    const filtre = parseConversationFilter(params.get("filtre"));
    const lien = params.has("lien") ? (params.get("lien") ?? "") : null;
    const conversations = await listConversations(
      { conversations: pgConversationRepository(getPool()) },
      actor,
      filtre,
      lien,
    );
    return NextResponse.json({ conversations });
  } catch (error) {
    return errorResponse(error);
  }
}
