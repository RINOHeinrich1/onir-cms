import { NextResponse } from "next/server";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";

/** GET /api/health — sonde de déploiement (ping DB `SELECT 1`). */
export async function GET(): Promise<NextResponse> {
  try {
    await getPool().query("SELECT 1");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
