import { ValidationError } from "@/application/errors";
import { createConversationForApi } from "@/application/public-api/conversations";
import { conversationChatDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { readJsonObject, requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

/** POST /api/v1/chatbots/{id}/conversations — démarre une conversation. */
export const POST = withApiKey(
  "conversations:write",
  async ({ request, requestId, principal, params }) => {
    const chatbotId = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Corps JSON requis");
    const rawChannel = body.channel;
    if (rawChannel !== undefined && rawChannel !== "page" && rawChannel !== "widget") {
      throw new ValidationError("Canal invalide (page ou widget)");
    }
    const data = await createConversationForApi(
      conversationChatDeps(),
      principal.organizationId,
      chatbotId,
      {
        visitor: body.visitor,
        consentement: body.consentement,
        ...(rawChannel === undefined ? {} : { channel: rawChannel }),
      },
    );
    return apiJson({ data }, requestId, 201, {
      Location: `/api/v1/conversations/${data.conversation.id}`,
    });
  },
);
