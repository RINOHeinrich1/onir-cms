import { NextResponse } from "next/server";
import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { standaloneEdgeHostname, standaloneEdgeIps } from "@/lib/env";
import { errorResponse } from "../../../../_lib/errors";
import { requirePlatformAdmin } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/internal/standalone/domains/pending — jobs domaine pour le worker. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    await requirePlatformAdmin(request);
    const domains = await pgStandaloneRepository(getPool()).listPendingDomains();
    return NextResponse.json({
      domains: domains.map((domain) => ({
        id: domain.id,
        hostname: domain.hostname,
        chatbotId: domain.chatLinkId,
        verificationToken: domain.verificationToken,
        verificationRecord: `_onir-verify.${domain.hostname}`,
        cnameTarget: standaloneEdgeHostname(),
        edgeIps: standaloneEdgeIps(),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
