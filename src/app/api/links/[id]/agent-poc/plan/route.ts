import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireRole } from "@/app/api/_lib/require-user";
import { ValidationError } from "@/application/errors";
import { planTemplateEdit } from "@/application/use-cases/visual-templates/plan-template-edit";
import { routeTemplateSkills } from "@/application/use-cases/visual-templates/route-template-skills";
import { buildTemplateCapabilities } from "@/application/use-cases/visual-templates/template-capabilities";
import { validateTemplateEditReferences } from "@/domain/template-edit-references";
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
export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const prompt = text(body.request).slice(0, 4000);
    if (prompt === "") throw new ValidationError("Demande requise");
    const pool = getPool();
    const loaded = await loadTemplateEditContext(pool, actor, id, surfaceFrom(body.surface));
    const values = paramsFrom(body.params, loaded.workingParams, loaded);
    const previousPlan = body.previousPlan;
    const previousErrors = Array.isArray(body.previousErrors)
      ? body.previousErrors.filter((entry): entry is string => typeof entry === "string")
      : [];
    const initialReferenceErrors = new Set(
      validateTemplateEditReferences(loaded.editor, values).map(
        (error) => `${error.field}|${error.message}`,
      ),
    );
    const capabilities = buildTemplateCapabilities(loaded.editor, loaded.schema, values);
    const candidates = collectTemplateEditCandidates(
      {
        request: prompt,
        currentPageId: null,
        editor: loaded.editor,
        values,
      },
      40,
    );
    const skills = await templateSkillLoaderFor(pool).load(
      loaded.templateId,
      loaded.templateVersion,
    );
    const routed = await routeTemplateSkills({ aiFactory: pgAiClientFactory(pool) }, actor, {
      request: prompt,
      skills,
    });
    const selected = routed.skills.map((entry) => entry.skill.skill);
    const planned = await planTemplateEdit({ aiFactory: pgAiClientFactory(pool) }, actor, {
      request: prompt,
      page: null,
      candidates,
      editor: loaded.editor,
      schema: loaded.schema,
      values,
      skills: selected,
      capabilities,
      maxAttempts: 1,
      ...(previousPlan === undefined ? {} : { previousPlan }),
      previousErrors,
    });
    const referenceErrors =
      planned.status === "proposed"
        ? validateTemplateEditReferences(loaded.editor, planned.values).filter(
            (error) => !initialReferenceErrors.has(`${error.field}|${error.message}`),
          )
        : [];
    if (referenceErrors.length > 0) {
      return NextResponse.json({
        status: "rejected",
        values: null,
        proposal: null,
        warnings: planned.warnings,
        attempts: planned.attempts,
        attemptHistory: planned.attemptHistory,
        planRaw: planned.rawPlan,
        skills: routed.skills.map((entry) => ({
          id: entry.skill.skill.id,
          version: entry.skill.skill.version,
          confidence: entry.confidence,
          reason: entry.reason,
        })),
        clarification: null,
        errors: referenceErrors.map((error) => `${error.field} — ${error.message}`),
      });
    }
    return NextResponse.json({
      status: planned.status,
      values: planned.status === "proposed" ? planned.values : null,
      proposal: planned.status === "proposed" ? planned.proposal : null,
      warnings: planned.warnings,
      attempts: planned.attempts,
      attemptHistory: planned.attemptHistory,
      planRaw: planned.rawPlan,
      skills: routed.skills.map((entry) => ({
        id: entry.skill.skill.id,
        version: entry.skill.skill.version,
        confidence: entry.confidence,
        reason: entry.reason,
      })),
      clarification: planned.status === "clarification" ? planned.message : null,
      errors: planned.status === "rejected" ? planned.errors : [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
