import { NextResponse } from "next/server";
import { ValidationError } from "@/application/errors";
import { isStandaloneSslStatus, isStandaloneVerificationStatus } from "@/domain/standalone";
import { getPool } from "@/infrastructure/db/pool";
import { pgStandaloneRepository } from "@/infrastructure/db/standalone-repository";
import { errorResponse } from "../../../../../_lib/errors";
import { readJsonObject, stringField } from "../../../../../_lib/http";
import { requirePlatformAdmin } from "../../../../../_lib/require-user";

export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/internal/standalone/domains/:id/status — statut DNS/SSL du worker. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    await requirePlatformAdmin(request);
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) throw new ValidationError("Requête invalide");
    const repo = pgStandaloneRepository(getPool());
    const domain = await repo.findDomain(id);
    if (domain === null) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

    const verificationStatus = stringField(body, "verificationStatus");
    const sslStatus = stringField(body, "sslStatus");
    const lastError = stringField(body, "lastError");
    if (verificationStatus !== undefined) {
      if (!isStandaloneVerificationStatus(verificationStatus)) {
        throw new ValidationError("Statut de vérification invalide");
      }
      await repo.setDomainVerification({
        id,
        status: verificationStatus,
        lastError: lastError ?? null,
      });
    }
    if (sslStatus !== undefined) {
      if (!isStandaloneSslStatus(sslStatus)) throw new ValidationError("Statut SSL invalide");
      await repo.setDomainSsl({ id, status: sslStatus, lastError: lastError ?? null });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
