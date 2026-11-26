import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import { getTemplateEditSession } from "@/application/use-cases/visual-templates/template-edit-session";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditAuditRepository } from "@/infrastructure/db/template-edit-audit-repository";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";
import { templateSkillLoaderFor } from "../../../context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

/** GET /api/links/[id]/ai-edit/sessions/[sessionId]/audit */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id, sessionId } = await context.params;
    const pool = getPool();
    const deps = {
      sessions: pgTemplateEditSessionRepository(pool),
      aiFactory: pgAiClientFactory(pool),
      audit: pgTemplateEditAuditRepository(pool),
      skillLoader: templateSkillLoaderFor(pool),
    };
    await getTemplateEditSession(deps, actor, id, sessionId);
    const events = await deps.audit.listBySession(actor.organizationId ?? "", id, sessionId);
    return NextResponse.json({ sessionId, events });
  } catch (error) {
    return errorResponse(error);
  }
}
