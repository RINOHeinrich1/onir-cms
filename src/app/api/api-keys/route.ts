import { NextResponse } from "next/server";
import { createApiKey } from "@/application/use-cases/api-keys/create-api-key";
import { listApiKeys } from "@/application/use-cases/api-keys/list-api-keys";
import { pgApiKeyAuditRepository } from "@/infrastructure/db/api-key-audit-repository";
import { pgApiKeyRepository } from "@/infrastructure/db/api-key-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../_lib/errors";
import { clientIp, readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/api-keys — clés de l'organisation active (admin). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "api_keys:list");
    const keys = await listApiKeys({ apiKeys: pgApiKeyRepository(getPool()) }, actor);
    return NextResponse.json({ apiKeys: keys });
  } catch (error) {
    return errorResponse(error);
  }
}

/** POST /api/api-keys — génère une clé, secret retourné une seule fois. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "api_keys:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const created = await createApiKey(
      {
        apiKeys: pgApiKeyRepository(pool),
        audit: pgApiKeyAuditRepository(pool),
      },
      actor,
      { name: body.name, expiresInDays: body.expiresInDays, scopes: body.scopes },
      {
        ip: clientIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
