import { NextResponse } from "next/server";
import { NotFoundError } from "@/application/errors";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAiUsageRepository } from "@/infrastructure/db/ai-usage-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { requireSuperAdmin } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/organizations/[id]/limits/options — cibles IA de l'organisation (super-admin). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requireSuperAdmin(request);
    const { id } = await context.params;
    const pool = getPool();
    const organization = await pgOrganizationRepository(pool).findById(id);
    if (organization === null) throw new NotFoundError("Organisation introuvable");

    const providers = await pgAiProviderRepository(pool).list(id);
    const models = pgAiProviderModelRepository(pool);
    const clusters = await pgAiUsageRepository(pool).listClusters(id, true);
    const withModels = [];
    for (const provider of providers) {
      const providerModels = await models.list(id, provider.id, { enabledOnly: true });
      withModels.push({
        id: provider.id,
        label: provider.label,
        models: providerModels.map((model) => ({
          modelId: model.modelId,
          label: model.label,
          enabled: model.enabled,
        })),
      });
    }
    return NextResponse.json({
      providers: withModels,
      clusters: clusters.map((cluster) => ({
        id: cluster.id,
        label: cluster.label,
        actif: cluster.actif,
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
