import { ValidationError } from "@/application/errors";
import type { FicheSearchCriteria } from "@/application/ports/fiche-search-repository";
import { ficheDto } from "@/application/public-api/dto";
import { encodeApiCursor } from "@/application/public-api/pagination";
import { searchFiches } from "@/application/use-cases/fiches/search-fiches";
import { ficheSearchDeps } from "../_lib/deps";
import { apiJson, withApiKey } from "../_lib/handler";
import {
  parseCursor,
  parseDate,
  parseLimit,
  parseSort,
  parseUuid,
  queryString,
} from "../_lib/query";

export const dynamic = "force-dynamic";

function parseQuery(request: Request): FicheSearchCriteria {
  const params = new URL(request.url).searchParams;
  const templateVersionRaw = queryString(params, "templateVersion");
  const templateVersion = templateVersionRaw === null ? null : Number(templateVersionRaw);
  if (templateVersion !== null && (!Number.isInteger(templateVersion) || templateVersion < 1)) {
    throw new ValidationError("templateVersion invalide");
  }
  const includeArchived = queryString(params, "includeArchived") === "true";
  const cursor = parseCursor(params);
  return {
    q: queryString(params, "q"),
    templateKey: queryString(params, "templateKey"),
    templateVersion,
    createdFrom: parseDate(params, "createdFrom"),
    createdTo: parseDate(params, "createdTo"),
    prospectId: parseUuid(params, "prospectId"),
    conversationId: parseUuid(params, "conversationId"),
    linkId: parseUuid(params, "chatbotId") ?? parseUuid(params, "linkId"),
    includeArchived,
    limit: parseLimit(params),
    sort: parseSort(params),
    cursor: cursor === null ? null : { createdAt: cursor.createdAt, id: cursor.id },
  };
}

export const GET = withApiKey("fiches:read", async ({ request, requestId, principal }) => {
  const criteria = parseQuery(request);
  const result = await searchFiches(ficheSearchDeps(), principal.organizationId, criteria);
  return apiJson(
    {
      data: result.fiches.map(ficheDto),
      pagination: {
        limit: criteria.limit,
        hasMore: result.nextCursor !== null,
        nextCursor: result.nextCursor === null ? null : encodeApiCursor(result.nextCursor),
      },
    },
    requestId,
  );
});
