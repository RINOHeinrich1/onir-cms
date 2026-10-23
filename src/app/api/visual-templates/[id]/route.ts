import { NextResponse } from "next/server";
import { getVisualTemplate } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/visual-templates/[id] — détail (versions installées). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:read");
    const { id } = await context.params;
    const detail = await getVisualTemplate(
      { templates: pgVisualTemplateRepository(getPool()) },
      actor,
      id,
    );
    return NextResponse.json(detail);
  } catch (error) {
    return errorResponse(error);
  }
}
