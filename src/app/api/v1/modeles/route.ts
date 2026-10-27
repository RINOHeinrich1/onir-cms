import { listTemplatesForApi, type TemplateListCriteria } from "@/application/public-api/modeles";
import { templateDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import { parseCursor, parseLimit, parseSort, queryString } from "../_lib/query";

export const dynamic = "force-dynamic";

function criteria(request: Request): TemplateListCriteria {
  const params = new URL(request.url).searchParams;
  return {
    q: queryString(params, "q"),
    limit: parseLimit(params),
    cursor: parseCursor(params),
    sort: parseSort(params),
  };
}

export const GET = withApiKey("modeles:read", async ({ request, requestId, principal }) => {
  const page = await listTemplatesForApi(
    templateDeps(),
    principal.organizationId,
    criteria(request),
  );
  return apiJson(page, requestId);
});
