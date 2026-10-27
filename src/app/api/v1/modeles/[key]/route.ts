import { getTemplateForApi } from "@/application/public-api/modeles";
import { templateDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";

export const dynamic = "force-dynamic";

export const GET = withApiKey("modeles:read", async ({ requestId, principal, params }) => {
  const data = await getTemplateForApi(templateDeps(), principal.organizationId, params.key ?? "");
  return apiJson({ data }, requestId);
});
