import { ficheDto } from "@/application/public-api/dto";
import { listProspectFichesForApi } from "@/application/public-api/prospects";
import { ficheDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("fiches:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const fiches = await listProspectFichesForApi(ficheDeps(), principal.organizationId, id);
  return apiJson({ data: fiches.map(ficheDto) }, requestId);
});
