import { setFicheArchiveForApi } from "@/application/public-api/fiches";
import { ficheDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const POST = withApiKey("fiches:write", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await setFicheArchiveForApi(ficheDeps(), principal.organizationId, id, false);
  return apiJson({ data }, requestId);
});
