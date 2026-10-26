import { NextResponse } from "next/server";
import { revokeApiKey } from "@/application/use-cases/api-keys/revoke-api-key";
import { pgApiKeyAuditRepository } from "@/infrastructure/db/api-key-audit-repository";
import { pgApiKeyRepository } from "@/infrastructure/db/api-key-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../_lib/errors";
import { clientIp } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** DELETE /api/api-keys/:id — révoque une clé (admin). */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "api_keys:revoke");
    const { id } = await params;
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "Clé introuvable" }, { status: 404 });
    }
    const pool = getPool();
    const key = await revokeApiKey(
      {
        apiKeys: pgApiKeyRepository(pool),
        audit: pgApiKeyAuditRepository(pool),
      },
      actor,
      id,
      {
        ip: clientIp(request) === "unknown" ? null : clientIp(request),
        userAgent: request.headers.get("user-agent"),
      },
    );
    return NextResponse.json({ apiKey: key });
  } catch (error) {
    return errorResponse(error);
  }
}
