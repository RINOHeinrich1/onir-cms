import { closeConversationForApi } from "@/application/public-api/conversations";
import { conversationDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const POST = withApiKey("conversations:write", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  await closeConversationForApi(conversationDeps(), principal.organizationId, id);
  return apiJson({ data: { id, status: "finalisee" } }, requestId);
});
