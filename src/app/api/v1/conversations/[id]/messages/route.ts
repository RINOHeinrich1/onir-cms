import {
  listConversationMessagesForApi,
  sendMessageForApi,
} from "@/application/public-api/conversations";
import { conversationChatDeps, conversationDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import {
  parseCursor,
  parseLimit,
  parseSort,
  readJsonObject,
  requireUuid,
} from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey(
  "conversations:read",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const search = new URL(request.url).searchParams;
    const page = await listConversationMessagesForApi(
      conversationDeps(),
      principal.organizationId,
      id,
      parseLimit(search, 50),
      parseCursor(search),
      parseSort(search),
    );
    return apiJson(page, requestId);
  },
);

/** POST /api/v1/conversations/{id}/messages — envoie un message visiteur. */
export const POST = withApiKey(
  "conversations:write",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    const data = await sendMessageForApi(conversationChatDeps(), principal.organizationId, id, {
      content: body?.content,
      attachmentIds: body?.attachmentIds,
    });
    return apiJson({ data }, requestId);
  },
);
