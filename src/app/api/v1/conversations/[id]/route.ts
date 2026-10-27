import { getConversationForApi } from "@/application/public-api/conversations";
import { conversationDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("conversations:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const detail = await getConversationForApi(conversationDeps(), principal.organizationId, id);
  return apiJson({ data: detail }, requestId);
});
