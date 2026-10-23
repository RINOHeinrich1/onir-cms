import { NextResponse } from "next/server";
import { listVisualTemplates } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../_lib/errors";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/visual-templates — templates visuels installés (US-TEMPLATE-001). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:list");
    const templates = await listVisualTemplates(
      { templates: pgVisualTemplateRepository(getPool()) },
      actor,
    );
    return NextResponse.json({ templates });
  } catch (error) {
    return errorResponse(error);
  }
}
