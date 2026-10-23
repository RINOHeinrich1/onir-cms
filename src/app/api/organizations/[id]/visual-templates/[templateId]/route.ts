import { NextResponse } from "next/server";
import { unassignVisualTemplate } from "@/application/use-cases/organizations/unassign-visual-template";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../../_lib/errors";
import { requireSuperAdmin } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

/** DELETE /api/organizations/[id]/visual-templates/[templateId] — retrait (super-admin). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);
    const { id, templateId } = await context.params;
    const pool = getPool();
    await unassignVisualTemplate(
      {
        organizations: pgOrganizationRepository(pool),
        templates: pgVisualTemplateRepository(pool),
      },
      actor,
      id,
      templateId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
