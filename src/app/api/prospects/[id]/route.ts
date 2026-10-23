import { NextResponse } from "next/server";
import { deleteProspect } from "@/application/use-cases/prospects/delete-prospect";
import { updateProspect } from "@/application/use-cases/prospects/update-prospect";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/prospects/[id] — modification partielle (admin/marketeur). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "prospects:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const prospect = await updateProspect(
      { prospects: pgProspectRepository(getPool()) },
      actor,
      id,
      body,
    );
    return NextResponse.json({ prospect });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/prospects/[id] — suppression (admin/marketeur). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "prospects:delete");
    const { id } = await context.params;
    await deleteProspect({ prospects: pgProspectRepository(getPool()) }, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
