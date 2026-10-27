import {
  deleteChatbotForApi,
  getChatbotForApi,
  updateChatbotForApi,
} from "@/application/public-api/chatbots";
import { chatbotReadDeps, chatbotWriteDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { readJsonObject, requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("chatbots:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await getChatbotForApi(chatbotReadDeps(), principal.organizationId, id);
  return apiJson({ data }, requestId);
});

export const PATCH = withApiKey(
  "chatbots:write",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    const data = await updateChatbotForApi(chatbotWriteDeps(), principal.organizationId, id, body);
    return apiJson({ data }, requestId);
  },
);

export const DELETE = withApiKey("chatbots:write", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  await deleteChatbotForApi(chatbotReadDeps(), principal.organizationId, id);
  return apiJson({ data: { id, deleted: true } }, requestId);
});
