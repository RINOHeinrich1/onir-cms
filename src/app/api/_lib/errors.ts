import { NextResponse } from "next/server";
import { AppError } from "@/application/errors";

/** Mappe une erreur applicative vers une réponse HTTP sans fuite d'infrastructure. */
export function errorResponse(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  process.stderr.write(`[api] erreur inattendue : ${String(error)}\n`);
  return NextResponse.json({ error: "Erreur interne" }, { status: 500 });
}
