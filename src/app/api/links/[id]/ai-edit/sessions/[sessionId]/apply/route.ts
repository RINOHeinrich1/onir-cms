import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { applyTemplateEditSessionProposal } from "@/application/use-cases/visual-templates/template-edit-session";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditAuditRepository } from "@/infrastructure/db/template-edit-audit-repository";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";
import { loadTemplateEditContext, paramsFrom, surfaceFrom } from "../../../context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

/** POST /api/links/[id]/ai-edit/sessions/[sessionId]/apply */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id, sessionId } = await context.params;
    const body = await readJsonObject(request);
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body?.surface));
    const workingParams = paramsFrom(body?.params, loaded.workingParams, loaded);
    const result = await applyTemplateEditSessionProposal(
      {
        sessions: pgTemplateEditSessionRepository(pool),
        aiFactory: pgAiClientFactory(pool),
        audit: pgTemplateEditAuditRepository(pool),
      },
      actor,
      { ...loaded, workingParams },
      sessionId,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
