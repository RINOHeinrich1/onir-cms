import { listConversationMessagesForApi } from "@/application/public-api/conversations";
import { conversationDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { parseCursor, parseLimit, parseSort, requireUuid } from "../../../_lib/query";

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
