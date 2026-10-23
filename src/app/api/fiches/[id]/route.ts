import { NextResponse } from "next/server";
import { setFicheArchivee } from "@/application/use-cases/fiche/manage-fiches";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/fiches/[id] — archivage / désarchivage (US-FICHE-002, admin/marketeur). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "project:write");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null || typeof body.archivee !== "boolean") {
      return NextResponse.json({ error: "Champ 'archivee' (booléen) requis" }, { status: 400 });
    }
    const fiche = await setFicheArchivee(
      { fiches: pgFicheRepository(getPool()) },
      actor,
      id,
      body.archivee,
    );
    return NextResponse.json({ fiche });
  } catch (error) {
    return errorResponse(error);
  }
}
