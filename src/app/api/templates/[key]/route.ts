import { NextResponse } from "next/server";
import { deleteTemplate } from "@/application/use-cases/templates/delete-template";
import { getTemplate } from "@/application/use-cases/templates/get-template";
import { updateTemplate } from "@/application/use-cases/templates/update-template";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ key: string }> };

/** GET /api/templates/[key] — modèle + versions (lecture). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "templates:read");
    const { key } = await context.params;
    const detail = await getTemplate(
      { templates: pgChatTemplateRepository(getPool()) },
      actor,
      key,
    );
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}

/** PUT /api/templates/[key] — nouvelle version (marketeur/admin). */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "templates:update");
    const { key } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const version = await updateTemplate(
      { templates: pgChatTemplateRepository(getPool()) },
      actor,
      key,
      body,
    );
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/templates/[key] — suppression (refusée si référencée). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "templates:delete");
    const { key } = await context.params;
    await deleteTemplate({ templates: pgChatTemplateRepository(getPool()) }, actor, key);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
