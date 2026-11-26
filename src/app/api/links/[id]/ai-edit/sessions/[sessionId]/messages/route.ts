import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { continueTemplateEditSession } from "@/application/use-cases/visual-templates/template-edit-session";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";
import { loadTemplateEditContext, paramsFrom, surfaceFrom } from "../../../context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

/** POST /api/links/[id]/ai-edit/sessions/[sessionId]/messages */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id, sessionId } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const workingParams = paramsFrom(body.params, loaded.workingParams, loaded);
    const session = await continueTemplateEditSession(
      {
        sessions: pgTemplateEditSessionRepository(pool),
        aiFactory: pgAiClientFactory(pool),
      },
      actor,
      { ...loaded, workingParams },
      sessionId,
      { message: body.message, selection: body.selection, params: workingParams },
    );
    return NextResponse.json({ session });
  } catch (error) {
    return errorResponse(error);
  }
}
