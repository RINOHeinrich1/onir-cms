import { NextResponse } from "next/server";
import {
  DEFAULT_NOTIFICATION_LIMIT,
  listActivityNotifications,
} from "@/application/use-cases/notifications/list-activity-notifications";
import { pgActivityRepository } from "@/infrastructure/db/activity-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { requireUser } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/**
 * GET /api/notifications?limit=6 — dernieres activites accessibles, compteur
 * non lu et pagination par limite.
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const { actor } = await requireUser(request);
    const rawLimit = new URL(request.url).searchParams.get("limit");
    const parsed = rawLimit === null ? Number.NaN : Number.parseInt(rawLimit, 10);
    const limit = Number.isNaN(parsed) ? DEFAULT_NOTIFICATION_LIMIT : parsed;
    const pool = getPool();
    const feed = await listActivityNotifications(
      {
        activity: pgActivityRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
      },
      actor,
      limit,
    );
    return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
