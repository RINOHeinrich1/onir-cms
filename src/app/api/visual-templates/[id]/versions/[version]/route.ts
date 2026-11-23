import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import {
  setVisualTemplateVersionDisabled,
  uninstallVisualTemplateVersion,
} from "@/application/use-cases/visual-templates/manage-visual-template-versions";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateAuditRepository } from "@/infrastructure/db/visual-template-audit-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../../../_lib/errors";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string; version: string }> };

function dependencies() {
  return {
    templates: pgVisualTemplateRepository(getPool()),
    storage: mediaStorage(),
    audit: pgVisualTemplateAuditRepository(getPool()),
  };
}

/** PATCH /api/visual-templates/[id]/versions/[version] — désactiver/réactiver. */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:uninstall");
    const { id, version } = await context.params;
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ValidationError("Corps JSON invalide");
    }
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("Objet { disabled, reason? } attendu");
    }
    const input = body as { disabled?: unknown; reason?: unknown };
    if (typeof input.disabled !== "boolean") {
      throw new ValidationError("Le champ disabled doit être un booléen");
    }
    if (input.reason !== undefined && input.reason !== null && typeof input.reason !== "string") {
      throw new ValidationError("Le motif doit être une chaîne");
    }
    const updated = await setVisualTemplateVersionDisabled(
      dependencies(),
      actor,
      id,
      version,
      input.disabled,
      typeof input.reason === "string" ? input.reason : null,
    );
    return NextResponse.json({ version: updated });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/visual-templates/[id]/versions/[version] — désinstaller la version. */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:uninstall");
    const { id, version } = await context.params;
    const result = await uninstallVisualTemplateVersion(dependencies(), actor, id, version);
    return NextResponse.json({
      ok: true,
      usage: result.usage,
      storageCleanupFailed: result.storageCleanupFailed,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
