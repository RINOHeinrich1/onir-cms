import { NextResponse } from "next/server";
import { createProspect } from "@/application/use-cases/prospects/create-prospect";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { parseProspectOriginFilter } from "@/domain/entities/prospect";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/prospects — liste (US-PROSPECT-001, lecture tous rôles). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "prospects:list");
    const origine = parseProspectOriginFilter(new URL(request.url).searchParams.get("origine"));
    const prospects = await listProspects(
      { prospects: pgProspectRepository(getPool()) },
      actor,
      origine,
    );
    return NextResponse.json({ prospects });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/prospects — création (admin/marketeur). */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "prospects:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const prospect = await createProspect(
      { prospects: pgProspectRepository(getPool()) },
      actor,
      body,
    );
    return NextResponse.json({ prospect }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
