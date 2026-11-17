import { NextResponse } from "next/server";
import { AiRateLimitError, AppError } from "@/application/errors";

/** Mappe une erreur applicative vers une réponse HTTP sans fuite d'infrastructure. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.code === undefined ? {} : { code: error.code }),
        ...("usages" in error && typeof error.usages === "number" ? { usages: error.usages } : {}),
        ...("limit" in error && typeof error.limit === "number" ? { limit: error.limit } : {}),
      },
      {
        status: error.status,
        ...(error instanceof AiRateLimitError
          ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
          : {}),
      },
    );
  }
  process.stderr.write(`[api] erreur inattendue : ${String(error)}\n`);
  return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
}
