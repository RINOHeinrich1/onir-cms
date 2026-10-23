import { NextResponse } from "next/server";
import { ForbiddenError, ValidationError } from "@/application/errors";
import { TemplateQueryError } from "@/application/ports/template-query-executor";
import { getPool } from "@/infrastructure/db/pool";
import { getTemplateDataExecutor } from "@/infrastructure/db/template-data-runtime";
import { listTemplateReadViews } from "@/infrastructure/db/template-schema-catalog";
import { errorResponse } from "../../../../_lib/errors";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

const VIEW_NAME = /^v_[a-z][a-z0-9_]*$/;

/**
 * GET — catalogue des vues exposées (`template_read`) et, avec `?view=…`, un
 * échantillon borné (3 lignes) de la vue pour aider au choix des colonnes.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:read");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const pool = getPool();
    const views = await listTemplateReadViews(pool);
    const view = new URL(request.url).searchParams.get("view");
    if (view === null) return NextResponse.json({ views });
    if (!VIEW_NAME.test(view) || !views.some((entry) => entry.name === view)) {
      throw new ValidationError("Vue inconnue");
    }
    try {
      const executor = await getTemplateDataExecutor(pool);
      const result = await executor.execute({
        sql: `SELECT * FROM ${view}`,
        organizationId: actor.organizationId,
        maxRows: 3,
      });
      const rows = result.rows.map((row) => {
        const copy = { ...row };
        delete copy.organization_id;
        return copy;
      });
      return NextResponse.json({
        views,
        sample: { view, rows, truncated: result.truncated },
      });
    } catch (error) {
      const message =
        error instanceof TemplateQueryError ? error.message : "Échantillon indisponible";
      return NextResponse.json({ views, sample: null, error: message });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
