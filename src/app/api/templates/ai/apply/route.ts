import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { readJsonObject } from "@/app/api/_lib/http";
import { requireUser } from "@/app/api/_lib/require-user";
import { applyTemplateAiDraft } from "@/application/use-cases/templates/apply-template-ai-draft";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateAiRepository } from "@/infrastructure/db/template-ai-repository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/templates/ai/apply — version + connaissances atomiques (ADR-0038). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { actor } = await requireUser(request);
    const body = await readJsonObject(request);
    if (body === null) return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    const result = await applyTemplateAiDraft(
      { templatesAi: pgTemplateAiRepository(getPool()) },
      actor,
      {
        definition: body.definition,
        knowledge: body.knowledge,
        mergePolicy: body.mergePolicy,
        generationId: body.generationId,
        ...(typeof body.templateKey === "string" ? { templateKey: body.templateKey } : {}),
      },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
