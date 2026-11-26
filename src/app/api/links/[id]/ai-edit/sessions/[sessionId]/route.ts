import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import {
  archiveTemplateEditSession,
  getTemplateEditSession,
} from "@/application/use-cases/visual-templates/template-edit-session";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditAuditRepository } from "@/infrastructure/db/template-edit-audit-repository";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id, sessionId } = await context.params;
    const pool = getPool();
    const session = await getTemplateEditSession(
      {
        sessions: pgTemplateEditSessionRepository(pool),
        aiFactory: pgAiClientFactory(pool),
        audit: pgTemplateEditAuditRepository(pool),
      },
      actor,
      id,
      sessionId,
    );
    return NextResponse.json({ session });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id, sessionId } = await context.params;
    const pool = getPool();
    await archiveTemplateEditSession(
      {
        sessions: pgTemplateEditSessionRepository(pool),
        aiFactory: pgAiClientFactory(pool),
        audit: pgTemplateEditAuditRepository(pool),
      },
      actor,
      id,
      sessionId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
