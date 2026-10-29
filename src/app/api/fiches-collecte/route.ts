import { NextResponse } from "next/server";
import {
  createFicheCollecte,
  listFicheCollectes,
} from "@/application/use-cases/fiches-collecte/manage-fiche-collectes";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

function deps() {
  return { fiches: pgFicheCollecteRepository(getPool()) };
}

/** GET /api/fiches-collecte — fiches réutilisables de l'organisation. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "fiches_collecte:list");
    return NextResponse.json({ fiches: await listFicheCollectes(deps(), actor) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/fiches-collecte — création d'une fiche (version 1). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "fiches_collecte:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const fiche = await createFicheCollecte(deps(), actor, body);
    return NextResponse.json({ fiche }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
