import {
  deleteWebhookForApi,
  getWebhookForApi,
  updateWebhookForApi,
} from "@/application/public-api/webhooks";
import { webhookManageDeps, webhookReadDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { readJsonObject, requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("webhooks:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await getWebhookForApi(webhookReadDeps(), principal.organizationId, id);
  return apiJson({ data }, requestId);
});

export const PATCH = withApiKey(
  "webhooks:write",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    const data = await updateWebhookForApi(webhookManageDeps(), principal.organizationId, id, body);
    return apiJson({ data }, requestId);
  },
);

export const DELETE = withApiKey("webhooks:write", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  await deleteWebhookForApi(webhookManageDeps(), principal.organizationId, id);
  return apiJson({ data: { id, deleted: true } }, requestId);
});
