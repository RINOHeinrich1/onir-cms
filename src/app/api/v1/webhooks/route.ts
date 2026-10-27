import { createWebhookForApi, listWebhooksForApi } from "@/application/public-api/webhooks";
import { webhookManageDeps, webhookReadDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import { queryString, readJsonObject } from "../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("webhooks:read", async ({ request, requestId, principal }) => {
  const templateKey = queryString(new URL(request.url).searchParams, "templateKey");
  const data = await listWebhooksForApi(webhookReadDeps(), principal.organizationId, templateKey);
  return apiJson({ data }, requestId);
});

export const POST = withApiKey("webhooks:write", async ({ request, requestId, principal }) => {
  const body = await readJsonObject(request);
  const endpoint = await createWebhookForApi(
    webhookManageDeps(),
    principal.organizationId,
    principal.createdBy,
    body,
  );
  return apiJson({ data: endpoint }, requestId, 201, {
    Location: `/api/v1/webhooks/${endpoint.id}`,
  });
});
