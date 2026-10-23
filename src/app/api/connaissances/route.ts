import { NextResponse } from "next/server";
import {
  createConnaissance,
  listConnaissances,
} from "@/application/use-cases/connaissances/manage-connaissances";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/connaissances — liste (US-CONNAISS-001, lecture). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "connaissances:list");
    const pool = getPool();
    const connaissances = await listConnaissances(
      { connaissances: pgConnaissanceRepository(pool) },
      actor,
    );
    return NextResponse.json({
      connaissances: await attachCreatorLabels(connaissances, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/connaissances — création (admin/marketeur). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "connaissances:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const connaissance = await createConnaissance(
      { connaissances: pgConnaissanceRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ connaissance }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
