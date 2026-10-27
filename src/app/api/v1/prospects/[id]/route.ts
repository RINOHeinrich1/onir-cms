import { getProspectForApi, updateProspectForApi } from "@/application/public-api/prospects";
import { prospectDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { readJsonObject, requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("prospects:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await getProspectForApi(prospectDeps(), principal.organizationId, id);
  return apiJson({ data }, requestId);
});

export const PATCH = withApiKey(
  "prospects:write",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    const data = await updateProspectForApi(prospectDeps(), principal.organizationId, id, body);
    return apiJson({ data }, requestId);
  },
);
