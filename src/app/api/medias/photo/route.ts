import { NextResponse } from "next/server";
import { createMediaPhoto } from "@/application/use-cases/medias/manage-medias";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { mediaStorage } from "@/infrastructure/storage";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/**
 * POST /api/medias/photo — import d'une photo (multipart, admin/marketeur).
 * Champs : `fichier` (image), `libelle`, `description` (longue), `templateKey` (portée), `actif`.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "medias:create");

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

    const media = await createMediaPhoto(
      {
        medias: pgMediaRepository(getPool()),
        storage: mediaStorage(actor.organizationId ?? undefined),
      },
      actor,
      {
        meta: {
          libelle: form.get("libelle"),
          description: form.get("description"),
          templateKeys: form.getAll("templateKeys").filter((value) => typeof value === "string"),
          actif: form.get("actif") !== "false",
        },
        data: Buffer.from(await fichier.arrayBuffer()),
        contentType: fichier.type,
      },
    );
    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
