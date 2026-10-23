import { NextResponse } from "next/server";
import { importVisualTemplate } from "@/application/use-cases/visual-templates/import-template";
import { zipTemplateArchive } from "@/infrastructure/archive/zip-template-archive";
import { nodeTemplateHasher } from "@/infrastructure/crypto/sha256";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../_lib/errors";
import { requireSuperAdmin } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/visual-templates/import — import d'un bundle `.onirtech-template`
 * (multipart, champ `fichier`). Admin/marketeur (US-TEMPLATE-001).
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireSuperAdmin(request);

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

    const result = await importVisualTemplate(
      {
        templates: pgVisualTemplateRepository(getPool()),
        storage: mediaStorage(actor.organizationId ?? undefined),
        archive: zipTemplateArchive(),
        hasher: nodeTemplateHasher(),
      },
      actor,
      { data: Buffer.from(await fichier.arrayBuffer()) },
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
