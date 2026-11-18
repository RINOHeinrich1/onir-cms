import { NextResponse } from "next/server";
import { setPlatformVisualTemplateInstallation } from "@/application/use-cases/visual-templates/install-visual-template";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateAuditRepository } from "@/infrastructure/db/visual-template-audit-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../../../_lib/errors";
import { requirePlatformSuperAdmin } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; templateId: string }> };

/** PUT — préinstaller un template plateforme dans une organisation. */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requirePlatformSuperAdmin(request);
    const { id, templateId } = await context.params;
    await setPlatformVisualTemplateInstallation(
      {
        templates: pgVisualTemplateRepository(getPool()),
        audit: pgVisualTemplateAuditRepository(getPool()),
      },
      actor,
      id,
      templateId,
      true,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE — retirer un template plateforme d'une organisation. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requirePlatformSuperAdmin(request);
    const { id, templateId } = await context.params;
    await setPlatformVisualTemplateInstallation(
      {
        templates: pgVisualTemplateRepository(getPool()),
        audit: pgVisualTemplateAuditRepository(getPool()),
      },
      actor,
      id,
      templateId,
      false,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
