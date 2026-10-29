import {
  deleteConnaissanceForApi,
  getConnaissanceForApi,
  updateConnaissanceForApi,
} from "@/application/public-api/connaissances";
import { connaissanceDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { readJsonObject, requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("connaissances:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await getConnaissanceForApi(connaissanceDeps(), principal.organizationId, id);
  return apiJson({ data }, requestId);
});

export const PATCH = withApiKey(
  "connaissances:write",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    const data = await updateConnaissanceForApi(connaissanceDeps(), principal, id, body);
    return apiJson({ data }, requestId);
  },
);

export const DELETE = withApiKey(
  "connaissances:write",
  async ({ requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    await deleteConnaissanceForApi(connaissanceDeps(), principal, id);
    return apiJson({ ok: true }, requestId);
  },
);
