import { ValidationError } from "@/application/errors";
import {
  createMediaLinkForApi,
  createMediaPhotoForApi,
  listMediasForApi,
  type MediaListCriteria,
} from "@/application/public-api/medias";
import { TYPES_MEDIA, type TypeMedia } from "@/domain/entities/media";
import { mediaReadDeps, mediaWriteDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import {
  parseBoolean,
  parseCursor,
  parseEnum,
  parseLimit,
  parseSort,
  parseUuid,
  queryString,
  readJsonObject,
} from "../_lib/query";

export const dynamic = "force-dynamic";

function criteria(request: Request): MediaListCriteria {
  const params = new URL(request.url).searchParams;
  return {
    q: queryString(params, "q"),
    type: parseEnum<TypeMedia>(params, "type", TYPES_MEDIA),
    active: parseBoolean(params, "active"),
    chatbotId: parseUuid(params, "chatbotId"),
    limit: parseLimit(params),
    cursor: parseCursor(params),
    sort: parseSort(params),
  };
}

export const GET = withApiKey("medias:read", async ({ request, requestId, principal }) => {
  const page = await listMediasForApi(mediaReadDeps(), principal.organizationId, criteria(request));
  return apiJson(page, requestId);
});

export const POST = withApiKey("medias:write", async ({ request, requestId, principal }) => {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  const data = contentType.includes("multipart/form-data")
    ? await (async () => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          throw new ValidationError("Formulaire multipart invalide");
        }
        return createMediaPhotoForApi(mediaWriteDeps(), principal, form);
      })()
    : await createMediaLinkForApi(mediaWriteDeps(), principal, await readJsonObject(request));
  return apiJson({ data }, requestId, 201, {
    Location: `/api/v1/medias/${data.id}`,
  });
});
