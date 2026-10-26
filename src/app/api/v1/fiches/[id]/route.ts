import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { AppError, UnauthorizedError } from "@/application/errors";
import { getFicheForOrganization } from "@/application/use-cases/fiches/get-fiche";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { apiKeyHourLimiter, apiKeyMinuteLimiter } from "@/lib/api-limiters";
import { authenticateApiRequest } from "../../../_lib/api-key-auth";

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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
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

    const { id } = await params;
    if (!UUID.test(id)) return apiError(404, "not_found", "Fiche introuvable", requestId);
    const fiche = await getFicheForOrganization(
      { fiches: pgFicheRepository(getPool()) },
      auth.organizationId,
      id,
    );
    return NextResponse.json(
      {
        data: {
          id: fiche.id,
          createdAt: fiche.createdAt,
          template: { key: fiche.templateKey, version: fiche.templateVersion },
          prospectId: fiche.prospectId,
          conversationId: fiche.conversationId,
          archivee: fiche.archivee,
          data: fiche.data,
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
      return apiError(
        error.status,
        error.status === 404 ? "not_found" : "invalid_request",
        error.message,
        requestId,
      );
    }
    process.stderr.write(`[api/v1/fiches/:id] ${String(error)}\n`);
    return apiError(500, "internal_error", "Erreur interne", requestId);
  }
}
