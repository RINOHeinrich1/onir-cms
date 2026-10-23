import { NextResponse } from "next/server";
import {
  createConfidentialite,
  listConfidentialites,
} from "@/application/use-cases/confidentialites/manage-confidentialites";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/confidentialites — liste (US-CONFID-001, lecture). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "confidentialites:list");
    const pool = getPool();
    const confidentialites = await listConfidentialites(
      { confidentialites: pgConfidentialiteRepository(pool) },
      actor,
    );
    return NextResponse.json({
      confidentialites: await attachCreatorLabels(confidentialites, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/confidentialites — création (admin/marketeur). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "confidentialites:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const confidentialite = await createConfidentialite(
      { confidentialites: pgConfidentialiteRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ confidentialite }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
