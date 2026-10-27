import { getTemplateVersionForApi } from "@/application/public-api/modeles";
import { templateDeps } from "../../../../_lib/deps";
import { apiJson, withApiKey } from "../../../../_lib/handler";
import { parsePositiveVersion } from "../../../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("modeles:read", async ({ requestId, principal, params }) => {
  const version = parsePositiveVersion(params.version ?? "");
  const data = await getTemplateVersionForApi(
    templateDeps(),
    principal.organizationId,
    params.key ?? "",
    version,
  );
  return apiJson({ data }, requestId);
});
