import { NextResponse } from "next/server";
import { pgAiGrantRepository } from "@/infrastructure/db/ai-grant-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireSuperAdmin } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/admin/ai/catalog — catalogue IA global réservé au super-admin. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);
    const catalog = await pgAiGrantRepository(getPool()).listCatalog();
    return NextResponse.json(catalog);
  } catch (error) {
    return errorResponse(error);
  }
}
