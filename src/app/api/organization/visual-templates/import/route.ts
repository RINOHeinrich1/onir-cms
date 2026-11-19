import { NextResponse } from "next/server";
import { importOrganizationVisualTemplate } from "@/application/use-cases/visual-templates/import-organization-template";
import { zipTemplateArchive } from "@/infrastructure/archive/zip-template-archive";
import { nodeTemplateHasher } from "@/infrastructure/crypto/sha256";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateAuditRepository } from "@/infrastructure/db/visual-template-audit-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

/** POST /api/organization/visual-templates/import — upload privé admin org. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "visualtemplates:upload");

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const fichier = form.get("fichier");
    if (!(fichier instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const result = await importOrganizationVisualTemplate(
      {
        templates: pgVisualTemplateRepository(getPool()),
        storage: mediaStorage(),
        archive: zipTemplateArchive(),
        hasher: nodeTemplateHasher(),
        audit: pgVisualTemplateAuditRepository(getPool()),
      },
      actor,
      { data: Buffer.from(await fichier.arrayBuffer()) },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
