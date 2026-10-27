import { getWebhookDeliveryForApi } from "@/application/public-api/webhooks";
import { webhookReadDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("webhooks:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await getWebhookDeliveryForApi(webhookReadDeps(), principal.organizationId, id);
  return apiJson({ data }, requestId);
});
