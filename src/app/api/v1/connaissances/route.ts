import {
  type ConnaissanceListCriteria,
  createConnaissanceForApi,
  listConnaissancesForApi,
} from "@/application/public-api/connaissances";
import { connaissanceDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import {
  parseBoolean,
  parseCursor,
  parseLimit,
  parseSort,
  parseUuid,
  queryString,
  readJsonObject,
} from "../_lib/query";

export const dynamic = "force-dynamic";

function criteria(request: Request): ConnaissanceListCriteria {
  const params = new URL(request.url).searchParams;
  return {
    q: queryString(params, "q"),
    active: parseBoolean(params, "active"),
    chatbotId: parseUuid(params, "chatbotId"),
    limit: parseLimit(params),
    cursor: parseCursor(params),
    sort: parseSort(params),
  };
}

export const GET = withApiKey("connaissances:read", async ({ request, requestId, principal }) => {
  const page = await listConnaissancesForApi(
    connaissanceDeps(),
    principal.organizationId,
    criteria(request),
  );
  return apiJson(page, requestId);
});

export const POST = withApiKey("connaissances:write", async ({ request, requestId, principal }) => {
  const body = await readJsonObject(request);
  const data = await createConnaissanceForApi(connaissanceDeps(), principal, body);
  return apiJson({ data }, requestId, 201, {
    Location: `/api/v1/connaissances/${data.id}`,
  });
});
