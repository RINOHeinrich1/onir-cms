import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { ValidationError } from "@/application/errors";
import { verifyAgentExecution } from "@/application/use-cases/visual-templates/agent-poc/agent-execution-verification";
import type { AgentExecutionLog } from "@/application/use-cases/visual-templates/agent-poc/agent-loop";
import { executeTemplateEditPlan } from "@/domain/template-edit-plan";
import { compileTemplateEditPlan } from "@/domain/template-edit-plan-compiler";
import { validateTemplateEditReferences } from "@/domain/template-edit-references";
import { collectTemplateEditCandidates } from "@/domain/template-edit-resolver";
import { getPool } from "@/infrastructure/db/pool";
import { loadTemplateEditContext, paramsFrom, surfaceFrom } from "../../ai-edit/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logFromStep(step: {
  stepId: string;
  label: string;
  status: "running" | "success" | "error";
  summary?: string;
  detail?: unknown;
  startedAt: string;
  endedAt: string;
}): AgentExecutionLog {
  const detail =
    step.detail !== null && typeof step.detail === "object"
      ? (step.detail as { operation?: unknown; itemId?: unknown })
      : {};
  return {
    stepId: step.stepId,
    label: step.label,
    operation: detail.operation ?? null,
    status: step.status === "success" ? "success" : "error",
    summary: step.summary ?? "",
    itemId: typeof detail.itemId === "string" ? detail.itemId : null,
    startedAt: step.startedAt,
    endedAt: step.endedAt,
  };
}

/**
 * Exécute un plan compilé sur un état candidat.
 * Aucune écriture en base : le résultat est renvoyé au POC.
 */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const plan = body.plan;
    if (plan === undefined || plan === null) throw new ValidationError("Plan requis");
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const values = paramsFrom(body.params, loaded.workingParams, loaded);
    const candidates = collectTemplateEditCandidates(
      {
        request: text(body.request).slice(0, 4000),
        currentPageId: null,
        editor: loaded.editor,
        values,
      },
      40,
    );
    const compiled = compileTemplateEditPlan({
      plan,
      editor: loaded.editor,
      schema: loaded.schema,
      candidates,
    });
    if (!compiled.ok) {
      return NextResponse.json({
        ok: false,
        values,
        logs: [],
        errors: compiled.errors.map((error) => `${error.code} ${error.path} : ${error.message}`),
        referenceErrors: [],
        verification: { ok: false, checks: [] },
      });
    }

    const logs: AgentExecutionLog[] = [];
    const execution = executeTemplateEditPlan({
      editor: loaded.editor,
      schema: loaded.schema,
      values,
      plan: compiled.value.plan,
      onStep: (step) => {
        if (step.status === "running") return;
        logs.push(logFromStep(step));
      },
    });

    if (!execution.ok) {
      return NextResponse.json({
        ok: false,
        values: execution.values,
        logs,
        errors: execution.errors,
        referenceErrors: [],
        verification: { ok: false, checks: [] },
      });
    }

    const initialReferences = new Set(
      validateTemplateEditReferences(loaded.editor, values).map(
        (error) => `${error.field}|${error.message}`,
      ),
    );
    const referenceErrors = validateTemplateEditReferences(loaded.editor, execution.values)
      .filter((error) => !initialReferences.has(`${error.field}|${error.message}`))
      .map((error) => `${error.field} — ${error.message}`);
    const verification = verifyAgentExecution({
      before: values,
      after: execution.values,
      logs,
    });

    return NextResponse.json({
      ok: referenceErrors.length === 0 && verification.ok,
      values: execution.values,
      proposal: execution.proposal,
      logs,
      errors: [],
      referenceErrors,
      verification,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
