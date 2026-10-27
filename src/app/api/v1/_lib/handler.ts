import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { authenticateApiRequest } from "@/app/api/_lib/api-key-auth";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  UnprocessableError,
  ValidationError,
} from "@/application/errors";
import type { PublicApiPrincipal } from "@/application/public-api/principal";
import type { ApiKeyScope } from "@/domain/entities/api-key";
import { apiKeyHourLimiter, apiKeyMinuteLimiter } from "@/lib/api-limiters";

export type ApiRouteContext = {
  params: Promise<Record<string, string>>;
};

export type ApiHandlerContext = {
  request: Request;
  requestId: string;
  principal: PublicApiPrincipal;
  params: Record<string, string>;
};

type ApiHandler = (context: ApiHandlerContext) => Promise<Response>;

function apiHeaders(requestId: string, extra: Record<string, string> = {}): HeadersInit {
  return {
    "Cache-Control": "no-store",
    "X-Request-Id": requestId,
    "X-RateLimit-Limit": "60",
    ...extra,
  };
}

export function apiJson(
  data: unknown,
  requestId: string,
  status = 200,
  extra: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: apiHeaders(requestId, extra),
  });
}

function apiError(
  status: number,
  code: string,
  message: string,
  requestId: string,
  extra: Record<string, string> = {},
): NextResponse {
  return NextResponse.json(
    { error: { code, message }, requestId },
    { status, headers: apiHeaders(requestId, extra) },
  );
}

function mapError(error: unknown, requestId: string): NextResponse {
  if (error instanceof UnauthorizedError) {
    return apiError(401, "invalid_api_key", error.message, requestId, {
      "WWW-Authenticate": 'Bearer realm="onir-api"',
    });
  }
  if (error instanceof ForbiddenError) {
    return apiError(403, "insufficient_scope", error.message, requestId);
  }
  if (error instanceof ValidationError) {
    return apiError(400, "invalid_request", error.message, requestId);
  }
  if (error instanceof NotFoundError) {
    return apiError(404, "not_found", error.message, requestId);
  }
  if (error instanceof ConflictError) {
    return apiError(409, "conflict", error.message, requestId);
  }
  if (error instanceof UnprocessableError) {
    return apiError(422, "invalid_request", error.message, requestId);
  }
  if (error instanceof AppError) {
    return apiError(error.status, "invalid_request", error.message, requestId);
  }
  process.stderr.write(`[api/v1] ${String(error)}\n`);
  return apiError(500, "internal_error", "Erreur interne", requestId);
}

export function withApiKey(scope: ApiKeyScope | ApiKeyScope[] | null, handler: ApiHandler) {
  return async (request: Request, context?: ApiRouteContext): Promise<Response> => {
    const requestId = randomUUID();
    try {
      const auth = await authenticateApiRequest(request);
      const requiredScopes = scope === null ? [] : Array.isArray(scope) ? scope : [scope];
      const missing = requiredScopes.find((required) => !auth.scopes.includes(required));
      if (missing !== undefined) {
        return apiError(403, "insufficient_scope", `Scope ${missing} requis`, requestId);
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

      const params = context?.params === undefined ? {} : await context.params;
      return await handler({
        request,
        requestId,
        principal: {
          apiKeyId: auth.key.id,
          organizationId: auth.organizationId,
          organizationName: auth.organization.name,
          createdBy: auth.key.createdBy,
          scopes: auth.scopes,
        },
        params,
      });
    } catch (error) {
      return mapError(error, requestId);
    }
  };
}
