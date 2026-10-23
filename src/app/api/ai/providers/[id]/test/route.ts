import { NextResponse } from "next/server";
import { testAiProvider } from "@/application/use-cases/ai/ai-provider-connectivity";
import { openAiModelCatalog } from "@/infrastructure/ai/model-catalog";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/ai/providers/[id]/test — teste la clé et le catalogue /models. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "ai:manage");
    const { id } = await context.params;
    const result = await testAiProvider(
      {
        providers: pgAiProviderRepository(getPool()),
        catalog: openAiModelCatalog,
      },
      actor,
      id,
    );
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
