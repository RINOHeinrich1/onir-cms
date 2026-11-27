import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { ValidationError } from "@/application/errors";
import type { AgentAttempt } from "@/application/use-cases/visual-templates/agent-poc/agent-attempt";
import type { AgentLoopEvent } from "@/application/use-cases/visual-templates/agent-poc/agent-loop";
import type { AgentObservation } from "@/application/use-cases/visual-templates/agent-poc/agent-observation";
import { explainAgentFailure } from "@/application/use-cases/visual-templates/agent-poc/explain-agent-failure";
import { buildTemplateCapabilities } from "@/application/use-cases/visual-templates/template-capabilities";
import { collectTemplateEditCandidates } from "@/domain/template-edit-resolver";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { getPool } from "@/infrastructure/db/pool";
import {
  loadTemplateEditContext,
  paramsFrom,
  surfaceFrom,
  templateSkillLoaderFor,
} from "../../ai-edit/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type RouteContext = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const requestText = text(body.request);
    const reason = text(body.reason);
    const observation = object(body.observation);
    const attempt = object(body.attempt);
    if (requestText === "" || reason === "" || observation === null) {
      throw new ValidationError("Contexte d’échec incomplet");
    }
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const values = paramsFrom(body.params, loaded.workingParams, loaded);
    const candidates = collectTemplateEditCandidates(
      {
        request: requestText,
        currentPageId: null,
        editor: loaded.editor,
        values,
      },
      40,
    );
    const capabilities = buildTemplateCapabilities(loaded.editor, loaded.schema, values);
    const skills = await templateSkillLoaderFor(pool).load(
      loaded.templateId,
      loaded.templateVersion,
    );
    const trace: AgentLoopEvent[] = Array.isArray(body.trace)
      ? body.trace
          .filter((entry): entry is Record<string, unknown> => object(entry) !== null)
          .map((entry) => ({
            phase: text(entry.phase) as AgentLoopEvent["phase"],
            title: text(entry.title),
            status: text(entry.status) as AgentLoopEvent["status"],
            ...(typeof entry.detail === "string" ? { detail: entry.detail } : {}),
            ...(typeof entry.attempt === "number" ? { attempt: entry.attempt } : {}),
            ...(typeof entry.stepId === "string" ? { stepId: entry.stepId } : {}),
          }))
      : [];
    const message = await explainAgentFailure({ aiFactory: pgAiClientFactory(pool) }, actor, {
      request: requestText,
      reason,
      trace,
      attempt: attempt as unknown as AgentAttempt | null,
      observation: observation as unknown as AgentObservation,
      values,
      history: Array.isArray(body.history) ? body.history : [],
      skills,
      capabilities,
      candidates,
    });
    return NextResponse.json({ message });
  } catch (error) {
    return errorResponse(error);
  }
}
