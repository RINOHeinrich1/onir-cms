import {
  deleteMediaForApi,
  getMediaForApi,
  updateMediaForApi,
} from "@/application/public-api/medias";
import { mediaReadDeps, mediaWriteDeps } from "../../_lib/deps";
import { apiJson, withApiKey } from "../../_lib/handler";
import { readJsonObject, requireUuid } from "../../_lib/query";

export const dynamic = "force-dynamic";

export const GET = withApiKey("medias:read", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  const data = await getMediaForApi(mediaReadDeps(), principal.organizationId, id);
  return apiJson({ data }, requestId);
});

export const PATCH = withApiKey(
  "medias:write",
  async ({ request, requestId, principal, params }) => {
    const id = requireUuid(params.id ?? "", "id");
    const body = await readJsonObject(request);
    const data = await updateMediaForApi(mediaReadDeps(), principal, id, body);
    return apiJson({ data }, requestId);
  },
);

export const DELETE = withApiKey("medias:write", async ({ requestId, principal, params }) => {
  const id = requireUuid(params.id ?? "", "id");
  await deleteMediaForApi(mediaWriteDeps(), principal, id);
  return apiJson({ ok: true }, requestId);
});
