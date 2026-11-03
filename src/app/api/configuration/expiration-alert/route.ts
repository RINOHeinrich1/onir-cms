import { NextResponse } from "next/server";
import { updateExpirationAlertDays } from "@/application/use-cases/organizations/manage-organization-settings";
import { pgOrganizationSettingsRepository } from "@/infrastructure/db/organization-settings-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/** PUT /api/configuration/expiration-alert — seuil d'alerte de l'organisation active. */
export async function PUT(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "organizations:update");
    const body = await readJsonObject(request);
    const days = body?.days;
    if (typeof days !== "number") {
      return NextResponse.json({ error: "Seuil invalide" }, { status: 400 });
    }
    const expirationAlertDays = await updateExpirationAlertDays(
      { settings: pgOrganizationSettingsRepository(getPool()) },
      actor,
      days,
    );
    return NextResponse.json({ expirationAlertDays });
  } catch (error) {
    return errorResponse(error);
  }
}
