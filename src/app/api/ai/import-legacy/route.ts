import { NextResponse } from "next/server";
import { importLegacyAiProvider } from "@/application/use-cases/ai/manage-ai-settings";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/** POST /api/ai/import-legacy — importe la config Infomaniak de l'environnement. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const pool = getPool();
    const provider = await importLegacyAiProvider(
      {
        providers: pgAiProviderRepository(pool),
        models: pgAiProviderModelRepository(pool),
      },
      actor,
    );
    return NextResponse.json({ provider }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
