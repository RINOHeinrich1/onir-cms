import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AppError, UnauthorizedError, ValidationError } from "@/application/errors";
import type { FicheSearchCriteria } from "@/application/ports/fiche-search-repository";
import { searchFiches } from "@/application/use-cases/fiches/search-fiches";
import type { Fiche } from "@/domain/entities/fiche";
import { pgFicheSearchRepository } from "@/infrastructure/db/fiche-search-repository";
import { getPool } from "@/infrastructure/db/pool";
import { decodeFicheCursor, encodeFicheCursor } from "@/lib/api-cursor";
import { apiKeyHourLimiter, apiKeyMinuteLimiter } from "@/lib/api-limiters";
import { authenticateApiRequest } from "../../_lib/api-key-auth";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extraHeaders: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...extraHeaders,
      },
    },
  );
}

function ficheDto(fiche: Fiche) {
  return {
    id: fiche.id,
    createdAt: fiche.createdAt,
    template: { key: fiche.templateKey, version: fiche.templateVersion },
    prospectId: fiche.prospectId,
    conversationId: fiche.conversationId,
    archivee: fiche.archivee,
    data: fiche.data,
  };
}

function queryParam(params: URLSearchParams, name: string): string | null {
  const value = params.get(name);
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function parseUuid(params: URLSearchParams, name: string): string | null {
  const value = queryParam(params, name);
  if (value !== null && !UUID.test(value)) throw new ValidationError(`${name} invalide`);
  return value;
}

function parseDate(params: URLSearchParams, name: string): string | null {
  const value = queryParam(params, name);
  if (value === null) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`${name} invalide`);
  return parsed.toISOString();
}

function parseQuery(request: Request): FicheSearchCriteria {
  const params = new URL(request.url).searchParams;
  const q = queryParam(params, "q");
  if (q !== null && q.length > 200) throw new ValidationError("q trop long (200 max)");
  const templateKey = queryParam(params, "templateKey");
  if (templateKey !== null && templateKey.length > 120) {
    throw new ValidationError("templateKey invalide");
  }
  const templateVersionRaw = queryParam(params, "templateVersion");
  const templateVersion = templateVersionRaw === null ? null : Number(templateVersionRaw);
  if (templateVersion !== null && (!Number.isInteger(templateVersion) || templateVersion < 1)) {
    throw new ValidationError("templateVersion invalide");
  }
  const createdFrom = parseDate(params, "createdFrom");
  const createdTo = parseDate(params, "createdTo");
  if (createdFrom !== null && createdTo !== null && createdFrom > createdTo) {
    throw new ValidationError("createdFrom doit précéder createdTo");
  }
  const limitRaw = queryParam(params, "limit");
  const limit = limitRaw === null ? 25 : Number(limitRaw);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new ValidationError("limit doit être compris entre 1 et 100");
  }
  const includeArchivedRaw = queryParam(params, "includeArchived");
  if (includeArchivedRaw !== null && !["true", "false"].includes(includeArchivedRaw)) {
    throw new ValidationError("includeArchived doit valoir true ou false");
  }
  const sortRaw = queryParam(params, "sort") ?? "createdAt:desc";
  if (!["createdAt:desc", "createdAt:asc"].includes(sortRaw)) {
    throw new ValidationError("sort doit valoir createdAt:desc ou createdAt:asc");
  }
  const cursorRaw = queryParam(params, "cursor");
  const cursor = cursorRaw === null ? null : decodeFicheCursor(cursorRaw);
  if (cursorRaw !== null && cursor === null) throw new ValidationError("cursor invalide");

  return {
    q,
    templateKey,
    templateVersion,
    createdFrom,
    createdTo,
    prospectId: parseUuid(params, "prospectId"),
    conversationId: parseUuid(params, "conversationId"),
    linkId: parseUuid(params, "linkId"),
    includeArchived: includeArchivedRaw === "true",
    limit,
    sort: sortRaw === "createdAt:asc" ? "asc" : "desc",
    cursor,
  };
}

export async function GET(request: Request): Promise<NextResponse> {
  const requestId = randomUUID();
  try {
    const auth = await authenticateApiRequest(request);
    if (!auth.scopes.includes("fiches:read")) {
      return apiError(403, "insufficient_scope", "Scope fiches:read requis", requestId);
    }

    const minute = apiKeyMinuteLimiter(auth.key.id);
    const hour = apiKeyHourLimiter(auth.key.id);
    let retryAfter = 0;
    if (minute.limited) retryAfter = minute.retryAfterSeconds;
    else if (hour.limited) retryAfter = hour.retryAfterSeconds;
    if (retryAfter > 0) {
      return apiError(429, "rate_limited", "Trop de requêtes", requestId, {
        "Retry-After": String(retryAfter),
      });
    }

    const criteria = parseQuery(request);
    const result = await searchFiches(
      { fiches: pgFicheSearchRepository(getPool()) },
      auth.organizationId,
      criteria,
    );
    return NextResponse.json(
      {
        data: result.fiches.map(ficheDto),
        pagination: {
          limit: criteria.limit,
          hasMore: result.nextCursor !== null,
          nextCursor: result.nextCursor === null ? null : encodeFicheCursor(result.nextCursor),
        },
      },
      {
        headers: {
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
          "X-RateLimit-Limit": "60",
        },
      },
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return apiError(401, "invalid_api_key", error.message, requestId, {
        "WWW-Authenticate": 'Bearer realm="onir-api"',
      });
    }
    if (error instanceof AppError) {
      return apiError(error.status, "invalid_request", error.message, requestId);
    }
    process.stderr.write(`[api/v1/fiches] ${String(error)}\n`);
    return apiError(500, "internal_error", "Erreur interne", requestId);
  }
}
