import {
  type ConversationListCriteria,
  listConversationsForApi,
} from "@/application/public-api/conversations";
import { conversationDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import {
  parseCursor,
  parseEnum,
  parseLimit,
  parseSort,
  parseUuid,
  queryString,
} from "../_lib/query";

export const dynamic = "force-dynamic";

function criteria(request: Request): ConversationListCriteria {
  const params = new URL(request.url).searchParams;
  return {
    status:
      parseEnum(params, "status", ["en_cours", "finalisees", "toutes", "archivees"] as const) ??
      "toutes",
    chatbotId: parseUuid(params, "chatbotId"),
    prospectId: parseUuid(params, "prospectId"),
    q: queryString(params, "q"),
    limit: parseLimit(params),
    cursor: parseCursor(params),
    sort: parseSort(params),
  };
}

export const GET = withApiKey("conversations:read", async ({ request, requestId, principal }) => {
  const page = await listConversationsForApi(
    conversationDeps(),
    principal.organizationId,
    criteria(request),
  );
  return apiJson(page, requestId);
});
