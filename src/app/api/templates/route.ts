import { NextResponse } from "next/server";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { createTemplate } from "@/application/use-cases/templates/create-template";
import { listTemplates } from "@/application/use-cases/templates/list-templates";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/templates — liste des modèles (lecture). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "templates:list");
    const pool = getPool();
    const templates = await listTemplates({ templates: pgChatTemplateRepository(pool) }, actor);
    return NextResponse.json({
      templates: await attachCreatorLabels(templates, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/templates — création d'un modèle + v1 (marketeur/admin). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "templates:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const version = await createTemplate(
      { templates: pgChatTemplateRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
