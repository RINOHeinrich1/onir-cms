import { NextResponse } from "next/server";
import {
  deleteConfidentialite,
  updateConfidentialite,
} from "@/application/use-cases/confidentialites/manage-confidentialites";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/confidentialites/[id] — modification (admin/marketeur). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "confidentialites:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const confidentialite = await updateConfidentialite(
      { confidentialites: pgConfidentialiteRepository(getPool()) },
      actor,
      id,
      body,
    );
    return NextResponse.json({ confidentialite });
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/confidentialites/[id] — suppression (admin/marketeur). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "confidentialites:delete");
    const { id } = await context.params;
    await deleteConfidentialite(
      { confidentialites: pgConfidentialiteRepository(getPool()) },
      actor,
      id,
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
