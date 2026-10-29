import { NextResponse } from "next/server";
import {
  deleteChatbotDraft,
  getChatbotDraft,
  updateChatbotDraft,
} from "@/application/use-cases/chatbot-drafts/manage-chatbot-drafts";
import { pgChatbotDraftRepository } from "@/infrastructure/db/chatbot-draft-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/chatbot-drafts/[id] — détail d'un brouillon. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    const { id } = await context.params;
    const draft = await getChatbotDraft({ drafts: pgChatbotDraftRepository(getPool()) }, actor, id);
    return NextResponse.json({ draft });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/chatbot-drafts/[id] — autosave du libellé et de l'état du wizard. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const draft = await updateChatbotDraft(
      { drafts: pgChatbotDraftRepository(getPool()) },
      actor,
      id,
      body,
    );
    return NextResponse.json({ draft });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * DELETE /api/chatbot-drafts/[id] — supprime le brouillon et ses photos
 * temporaires (les médias finalisés sont conservés).
 */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:revoke");
    const { id } = await context.params;
    const keepMediaIds = (new URL(request.url).searchParams.get("keepMedia") ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== "");
    const pool = getPool();
    await deleteChatbotDraft(
      {
        drafts: pgChatbotDraftRepository(pool),
        medias: pgMediaRepository(pool),
        storage: mediaStorage(actor.organizationId ?? undefined),
      },
      actor,
      id,
      { keepMediaIds },
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
