import { NextResponse } from "next/server";
import { markActivityNotificationsRead } from "@/application/use-cases/notifications/list-activity-notifications";
import { pgActivityRepository } from "@/infrastructure/db/activity-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { requireUser } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

/** POST /api/notifications/read — ouvre les notifications : avance le filigrane. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { actor } = await requireUser(request);
    const result = await markActivityNotificationsRead(
      { activity: pgActivityRepository(getPool()) },
      actor,
    );
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
