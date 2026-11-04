import { NextResponse } from "next/server";
import { setFicheQualificationStatus } from "@/application/use-cases/fiche/manage-fiche-status";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { readJsonObject } from "../../../_lib/http";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/fiches/[id]/status — statut de qualification (ADR-0067). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "project:write");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null || !Object.hasOwn(body, "statusKey")) {
      return NextResponse.json({ error: "Champ 'statusKey' requis" }, { status: 400 });
    }
    const statusKey = body.statusKey;
    if (statusKey !== null && typeof statusKey !== "string") {
      return NextResponse.json(
        { error: "statusKey doit être une chaîne ou null" },
        { status: 400 },
      );
    }
    const fiche = await setFicheQualificationStatus(
      { fiches: pgFicheRepository(getPool()) },
      actor,
      id,
      statusKey,
    );
    return NextResponse.json({ fiche });
  } catch (error) {
    return errorResponse(error);
  }
}
