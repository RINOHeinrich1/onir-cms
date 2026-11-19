import { NextResponse } from "next/server";
import {
  installVisualTemplateForOrganization,
  uninstallVisualTemplateForOrganization,
} from "@/application/use-cases/visual-templates/install-visual-template";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateAuditRepository } from "@/infrastructure/db/visual-template-audit-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ templateId: string }> };

/** PUT /api/organization/visual-templates/[templateId] — installer. */
export async function PUT(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:install");
    const { templateId } = await context.params;
    const installation = await installVisualTemplateForOrganization(
      {
        templates: pgVisualTemplateRepository(getPool()),
        audit: pgVisualTemplateAuditRepository(getPool()),
      },
      actor,
      templateId,
    );
    return NextResponse.json({ installation });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/organization/visual-templates/[templateId] — désinstaller. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:uninstall");
    const { templateId } = await context.params;
    await uninstallVisualTemplateForOrganization(
      {
        templates: pgVisualTemplateRepository(getPool()),
        audit: pgVisualTemplateAuditRepository(getPool()),
      },
      actor,
      templateId,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
