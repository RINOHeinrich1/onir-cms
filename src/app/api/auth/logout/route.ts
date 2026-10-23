import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { logout } from "@/application/use-cases/auth/logout";
import { SESSION_COOKIE } from "@/domain/session";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { clearSessionCookie } from "@/infrastructure/session/cookie";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — révoque la session et efface le cookie. */
export async function POST(): Promise<NextResponse> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token !== undefined) {
    await logout({ sessions: pgSessionRepository(getPool()) }, token);
  }
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
