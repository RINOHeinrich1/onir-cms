import { NextResponse } from "next/server";
import { listFicheCollecteVersions } from "@/application/use-cases/fiches-collecte/manage-fiche-collectes";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/fiches-collecte/[id]/versions — historique immuable. */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "fiches_collecte:read");
    const { id } = await context.params;
    const versions = await listFicheCollecteVersions(
      { fiches: pgFicheCollecteRepository(getPool()) },
      actor,
      id,
    );
    return NextResponse.json({ versions });
  } catch (error) {
    return errorResponse(error);
  }
}
