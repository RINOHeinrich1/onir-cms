import {
  type ChatbotListCriteria,
  createChatbotForApi,
  listChatbotsForApi,
} from "@/application/public-api/chatbots";
import { chatbotReadDeps, chatbotWriteDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import {
  parseBoolean,
  parseCursor,
  parseEnum,
  parseLimit,
  parseSort,
  queryString,
  readJsonObject,
} from "../_lib/query";

export const dynamic = "force-dynamic";

function criteria(request: Request): ChatbotListCriteria {
  const params = new URL(request.url).searchParams;
  return {
    q: queryString(params, "q"),
    type: parseEnum(params, "type", ["specifique", "standard"] as const),
    active: parseBoolean(params, "active"),
    limit: parseLimit(params),
    cursor: parseCursor(params),
    sort: parseSort(params),
  };
}

export const GET = withApiKey("chatbots:read", async ({ request, requestId, principal }) => {
  const page = await listChatbotsForApi(
    chatbotReadDeps(),
    principal.organizationId,
    criteria(request),
  );
  return apiJson(page, requestId);
});

export const POST = withApiKey("chatbots:write", async ({ request, requestId, principal }) => {
  const body = await readJsonObject(request);
  const data = await createChatbotForApi(
    chatbotWriteDeps(),
    principal.organizationId,
    principal.createdBy,
    body,
  );
  return apiJson({ data }, requestId, 201, {
    Location: `/api/v1/chatbots/${data.id}`,
  });
});
