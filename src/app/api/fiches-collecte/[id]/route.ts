import { NextResponse } from "next/server";
import {
  deleteFicheCollecte,
  getFicheCollecte,
  updateFicheCollecte,
} from "@/application/use-cases/fiches-collecte/manage-fiche-collectes";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function deps() {
  return { fiches: pgFicheCollecteRepository(getPool()) };
}

/** GET /api/fiches-collecte/[id] — détail de la version courante. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "fiches_collecte:read");
    const { id } = await context.params;
    return NextResponse.json({ fiche: await getFicheCollecte(deps(), actor, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** PATCH /api/fiches-collecte/[id] — nouvelle version (contenu immuable). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "fiches_collecte:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    return NextResponse.json({ fiche: await updateFicheCollecte(deps(), actor, id, body) });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/fiches-collecte/[id] — suppression (versions en cascade). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "fiches_collecte:delete");
    const { id } = await context.params;
    await deleteFicheCollecte(deps(), actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
