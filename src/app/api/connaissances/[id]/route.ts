import { NextResponse } from "next/server";
import {
  deleteConnaissance,
  updateConnaissance,
} from "@/application/use-cases/connaissances/manage-connaissances";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/connaissances/[id] — modification partielle (admin/marketeur). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "connaissances:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const connaissance = await updateConnaissance(
      { connaissances: pgConnaissanceRepository(getPool()) },
      actor,
      id,
      body,
    );
    return NextResponse.json({ connaissance });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/connaissances/[id] — suppression (admin/marketeur). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "connaissances:delete");
    const { id } = await context.params;
    await deleteConnaissance({ connaissances: pgConnaissanceRepository(getPool()) }, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
