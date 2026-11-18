import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { disableVisualTemplate } from "@/application/use-cases/visual-templates/install-visual-template";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateAuditRepository } from "@/infrastructure/db/visual-template-audit-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../../_lib/errors";
import { requirePlatformSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/platform/visual-templates/[id] — kill switch. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requirePlatformSuperAdmin(request);
    const { id } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      disabled?: unknown;
      reason?: unknown;
    } | null;
    if (body === null || typeof body.disabled !== "boolean") {
      throw new ValidationError("disabled boolean requis");
    }
    const reason = typeof body.reason === "string" ? body.reason.trim() : null;
    const template = await disableVisualTemplate(
      {
        templates: pgVisualTemplateRepository(getPool()),
        audit: pgVisualTemplateAuditRepository(getPool()),
      },
      actor,
      id,
      body.disabled,
      reason === "" ? null : reason,
    );
    return NextResponse.json({ template });
  } catch (error) {
    return errorResponse(error);
  }
}
