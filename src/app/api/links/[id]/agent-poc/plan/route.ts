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
    const observation = body.observation;
    const lastAttempt = body.lastAttempt;
    const history = Array.isArray(body.history)
      ? body.history
          .filter(
            (entry): entry is Record<string, unknown> =>
              entry !== null && typeof entry === "object",
          )
          .map((entry) => ({
            role: entry.role === "assistant" ? ("assistant" as const) : ("user" as const),
            content: typeof entry.content === "string" ? entry.content.slice(0, 4000) : "",
          }))
          .filter((entry) => entry.content.trim() !== "")
          .slice(-20)
      : [];
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
    const routingContext = {
      currentPage: null,
      collections: capabilities.collections.map((collection) => ({
        key: collection.param,
        label: collection.label,
        itemKindField: collection.itemKind,
      })),
      candidates: candidates.map((candidate) => ({
        collection: candidate.collection,
        label: candidate.label,
        kind: candidate.itemKind ?? null,
      })),
      insertionRules: capabilities.insertion.map((rule) => ({
        parentKind: rule.parentKind,
        childKinds: rule.allowedKinds,
        slot: rule.slot,
      })),
      capabilities: [
        ...capabilities.blockKinds.map((kind) => ({ id: `block:${kind}`, label: kind })),
        ...capabilities.actionKinds.map((kind) => ({ id: `action:${kind}`, label: kind })),
      ],
    };
    const routed = await routeTemplateSkills({ aiFactory: pgAiClientFactory(pool) }, actor, {
      request: prompt,
      skills,
      ...(history.length === 0 ? {} : { history }),
      context: routingContext,
      signal: request.signal,
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
      ...(observation === undefined ? {} : { observation }),
      ...(lastAttempt === undefined ? {} : { lastAttempt }),
      ...(history.length === 0 ? {} : { history }),
      planOnly: true,
      signal: request.signal,
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
      plan: planned.status === "planned" ? planned.plan : null,
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
      clarification: planned.status === "clarification" ? planned.message : null,
      errors: planned.status === "rejected" ? planned.errors : [],
    });
  } catch (error) {
    return errorResponse(error);
  }
}
