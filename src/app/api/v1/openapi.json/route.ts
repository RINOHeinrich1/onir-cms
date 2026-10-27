import { NextResponse } from "next/server";
import { openapiDocument } from "@/contracts/api-v1/openapi";

export const dynamic = "force-dynamic";

export function GET(): NextResponse {
  return NextResponse.json(openapiDocument(), {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Robots-Tag": "noindex",
    },
  });
}
