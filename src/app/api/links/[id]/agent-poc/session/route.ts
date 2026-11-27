import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
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
} from "../../ai-edit/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/links/[id]/agent-poc/session — reprend ou crée la mission. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = (await readJsonObject(request)) ?? {};
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const workingParams = paramsFrom(body.params, loaded.workingParams, loaded);
    const sessions = pgTemplateEditSessionRepository(pool);
    if (body.new === true) {
      const active = await sessions.findActive(organizationOf(actor), id, loaded.surface, actor.id);
      if (active !== null) await sessions.archive(organizationOf(actor), id, active.id);
    }
    const session = await startTemplateEditSession(
      {
        sessions,
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

/** PATCH /api/links/[id]/agent-poc/session — persiste l’état de mission. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = (await readJsonObject(request)) ?? {};
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (sessionId === "") throw new ValidationError("sessionId requis");
    const pool = getPool();
    const sessions = pgTemplateEditSessionRepository(pool);
    const organizationId = organizationOf(actor);
    const session = await sessions.find(organizationId, id, sessionId);
    if (session === null) throw new ValidationError("Session introuvable");
    const saved = await sessions.save(organizationId, id, sessionId, {
      ...session.state,
      agentPoc: body.agentPoc,
    });
    if (saved === null) throw new ValidationError("Session introuvable");
    return NextResponse.json({ session: saved });
  } catch (error) {
    return errorResponse(error);
  }
}
