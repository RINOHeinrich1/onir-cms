import { conversationSummaryDto } from "@/application/public-api/dto";
import { listProspectConversationsForApi } from "@/application/public-api/prospects";
import { conversationDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("conversations:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const conversations = await listProspectConversationsForApi(
    conversationDeps(),
    principal.organizationId,
    id,
  );
  return apiJson({ data: conversations.map(conversationSummaryDto) }, requestId);
});
