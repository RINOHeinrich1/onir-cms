import { NextResponse } from "next/server";
import {
  createChatbotDraft,
  listChatbotDrafts,
} from "@/application/use-cases/chatbot-drafts/manage-chatbot-drafts";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgChatbotDraftRepository } from "@/infrastructure/db/chatbot-draft-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/chatbot-drafts — brouillons de l'organisation (admin/marketeur). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    const pool = getPool();
    const drafts = await listChatbotDrafts({ drafts: pgChatbotDraftRepository(pool) }, actor);
    return NextResponse.json({
      drafts: await attachCreatorLabels(drafts, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/chatbot-drafts — création d'un brouillon de wizard. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const draft = await createChatbotDraft(
      { drafts: pgChatbotDraftRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ draft }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
