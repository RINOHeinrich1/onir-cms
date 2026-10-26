import { NextResponse } from "next/server";
import { getAppSecretsOverview } from "@/infrastructure/config/app-secrets";
import { errorResponse } from "../../_lib/errors";
import { requireSuperAdmin } from "../../_lib/require-super-admin";

export const dynamic = "force-dynamic";

/** GET /api/admin/app-secrets — métadonnées des secrets (super-admin). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);
    const overview = await getAppSecretsOverview();
    return NextResponse.json(overview, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
