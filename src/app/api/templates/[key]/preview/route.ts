import { NextResponse } from "next/server";
import { previewTemplate } from "@/application/use-cases/templates/preview-template";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ key: string }> };

/**
 * POST /api/templates/[key]/preview — rend une définition (brouillon)
 * avec des données fictives : prompt système + markdown.
 */
export async function POST(request: Request, _context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "templates:read");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const preview = await previewTemplate(
      { templates: pgChatTemplateRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ preview });
  } catch (error) {
    return errorResponse(error);
  }
}
