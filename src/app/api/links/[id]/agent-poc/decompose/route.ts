import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { organizationOf } from "@/application/actor";
import { ValidationError } from "@/application/errors";
import { decomposeMission } from "@/application/use-cases/visual-templates/agent-poc/decompose-mission";
import { createMissionProgress } from "@/application/use-cases/visual-templates/agent-poc/mission-objective";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateEditSessionRepository } from "@/infrastructure/db/template-edit-session-repository";
import { loadTemplateEditContext, surfaceFrom } from "../../ai-edit/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = (await readJsonObject(request)) ?? {};
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (goal === "") throw new ValidationError("goal requis");
    const pool = getPool();
    await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const decomposition = await decomposeMission({ aiFactory: pgAiClientFactory(pool) }, actor, {
      goal,
      constraints: strings(body.constraints),
      ...(body.observation === undefined ? {} : { observation: body.observation }),
      ...(body.history === undefined ? {} : { history: body.history }),
      ...(body.memory === undefined ? {} : { memory: body.memory }),
      signal: request.signal,
    });
    const missionProgress = createMissionProgress(goal, strings(body.constraints), decomposition);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    if (sessionId !== "") {
      const sessions = pgTemplateEditSessionRepository(pool);
      const session = await sessions.find(organizationOf(actor), id, sessionId);
      if (session === null) throw new ValidationError("Session introuvable");
      const current = record(session.state.agentPoc) ?? {};
      const saved = await sessions.save(organizationOf(actor), id, sessionId, {
        ...session.state,
        agentPoc: { ...current, missionProgress },
      });
      if (saved === null) throw new ValidationError("Session introuvable");
    }
    return NextResponse.json({ decomposition, missionProgress });
  } catch (error) {
    return errorResponse(error);
  }
}
