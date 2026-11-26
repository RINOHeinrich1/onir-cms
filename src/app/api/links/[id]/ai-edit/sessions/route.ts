import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { startTemplateEditSession } from "@/application/use-cases/visual-templates/template-edit-session";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditAuditRepository } from "@/infrastructure/db/template-edit-audit-repository";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";
import {
  loadTemplateEditContext,
  paramsFrom,
  surfaceFrom,
  templateSkillLoaderFor,
} from "../context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/links/[id]/ai-edit/sessions — reprend ou crée la session active. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body?.surface));
    const workingParams = paramsFrom(body?.params, loaded.workingParams, loaded);
    const session = await startTemplateEditSession(
      {
        sessions: pgTemplateEditSessionRepository(pool),
        aiFactory: pgAiClientFactory(pool),
        audit: pgTemplateEditAuditRepository(pool),
        skillLoader: templateSkillLoaderFor(pool),
      },
      actor,
      { ...loaded, workingParams },
    );
    return NextResponse.json({ session });
  } catch (error) {
    return errorResponse(error);
  }
}
