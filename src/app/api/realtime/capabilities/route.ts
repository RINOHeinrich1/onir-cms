import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { getChatEventBus } from "@/infrastructure/realtime";

export const dynamic = "force-dynamic";

/** GET /api/realtime/capabilities — transport SSE ou polling pour cette instance. */
export async function GET(): Promise<NextResponse> {
  try {
    const bus = getChatEventBus();
    return NextResponse.json({
      transport: bus.supportsSse ? "sse" : "polling",
      mode: bus.mode,
      distributed: bus.mode === "valkey",
    });
  } catch (error) {
    return errorResponse(error);
  }
}
