import { retryWebhookForApi } from "@/application/public-api/webhooks";
import { webhookExecutionDeps } from "../../../_lib/deps";
import { apiJson, withApiKey } from "../../../_lib/handler";
import { requireUuid } from "../../../_lib/query";

export const dynamic = "force-dynamic";

export const POST = withApiKey("webhooks:write", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await retryWebhookForApi(
    webhookExecutionDeps(),
    principal.organizationId,
    id,
    principal.createdBy,
  );
  return apiJson({ data }, requestId, 202, {
    Location: `/api/v1/webhook-deliveries/${data.id}`,
  });
});
