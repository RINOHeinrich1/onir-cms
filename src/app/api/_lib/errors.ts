import { NextResponse } from "next/server";
import { AiRateLimitError, AppError, OtpRateLimitError } from "@/application/errors";

/** Mappe une erreur applicative vers une réponse HTTP sans fuite d'infrastructure. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    if (error.status >= 500) {
      const cause = "cause" in error ? error.cause : undefined;
      const detail =
        cause instanceof Error
          ? `${cause.name}: ${cause.message}\n${cause.stack ?? ""}`
          : String(cause ?? "");
      process.stderr.write(
        `[api] ${error.name}: ${error.message}${detail === "" ? "" : `\n${detail}`}\n`,
      );
    }
    return NextResponse.json(
      {
        error: error.message,
        ...(error.code === undefined ? {} : { code: error.code }),
        ...("usages" in error && typeof error.usages === "number" ? { usages: error.usages } : {}),
        ...("usage" in error && typeof error.usage === "object" && error.usage !== null
          ? { usage: error.usage }
          : {}),
        ...("limit" in error && typeof error.limit === "number" ? { limit: error.limit } : {}),
      },
      {
        status: error.status,
        ...(error instanceof AiRateLimitError || error instanceof OtpRateLimitError
          ? { headers: { "Retry-After": String(error.retryAfterSeconds) } }
          : {}),
      },
    );
  }
  process.stderr.write(
    `[api] erreur inattendue : ${
      error instanceof Error
        ? `${error.name}: ${error.message}\n${error.stack ?? ""}`
        : String(error)
    }\n`,
  );
  return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
}
