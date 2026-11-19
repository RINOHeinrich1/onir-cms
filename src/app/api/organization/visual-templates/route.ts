import { NextResponse } from "next/server";
import { getOrganizationVisualTemplateCatalog } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/organization/visual-templates — catalogue de l'organisation active. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:list");
    const catalog = await getOrganizationVisualTemplateCatalog(
      { templates: pgVisualTemplateRepository(getPool()) },
      actor,
    );
    return NextResponse.json(catalog);
  } catch (error) {
    return errorResponse(error);
  }
}
