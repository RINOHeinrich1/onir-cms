import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { resolveConnaissanceConflicts } from "@/application/use-cases/connaissances/resolve-connaissance-conflicts";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";

/** POST /api/connaissances/conflicts — conflits de titres avant création. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const conflicts = await resolveConnaissanceConflicts(
      {
        connaissances: pgConnaissanceRepository(pool),
        links: pgChatLinkRepository(pool),
        configs: pgChatbotConfigRepository(pool),
      },
      actor,
      body,
    );
    return NextResponse.json({ conflicts });
  } catch (error) {
    return errorResponse(error);
  }
}
