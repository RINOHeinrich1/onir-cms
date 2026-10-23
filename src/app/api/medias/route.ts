import { NextResponse } from "next/server";
import { createMediaLien, listMedias } from "@/application/use-cases/medias/manage-medias";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/medias — liste de la médiathèque (US-MEDIA-001, lecture). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "medias:list");
    const pool = getPool();
    const medias = await listMedias({ medias: pgMediaRepository(pool) }, actor);
    return NextResponse.json({
      medias: await attachCreatorLabels(medias, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/medias — création d'un média de type `lien` (admin/marketeur). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "medias:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const media = await createMediaLien({ medias: pgMediaRepository(getPool()) }, actor, body);
    return NextResponse.json({ media }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
