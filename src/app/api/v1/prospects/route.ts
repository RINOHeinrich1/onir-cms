import {
  createProspectForApi,
  listProspectsForApi,
  type ProspectListCriteria,
} from "@/application/public-api/prospects";
import { prospectDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import {
  parseCursor,
  parseEnum,
  parseLimit,
  parseSort,
  parseUuid,
  queryString,
  readJsonObject,
} from "../_lib/query";

export const dynamic = "force-dynamic";

function criteria(request: Request): ProspectListCriteria {
  const params = new URL(request.url).searchParams;
  return {
    q: queryString(params, "q"),
    origine: parseEnum(params, "origine", ["saisie", "libre"] as const),
    chatbotId: parseUuid(params, "chatbotId"),
    limit: parseLimit(params),
    cursor: parseCursor(params),
    sort: parseSort(params),
  };
}

export const GET = withApiKey("prospects:read", async ({ request, requestId, principal }) => {
  const page = await listProspectsForApi(
    prospectDeps(),
    principal.organizationId,
    criteria(request),
  );
  return apiJson(page, requestId);
});

export const POST = withApiKey("prospects:write", async ({ request, requestId, principal }) => {
  const body = await readJsonObject(request);
  const data = await createProspectForApi(
    prospectDeps(),
    principal.organizationId,
    principal.createdBy,
    body,
  );
  return apiJson({ data }, requestId, 201, {
    Location: `/api/v1/prospects/${data.id}`,
  });
});
