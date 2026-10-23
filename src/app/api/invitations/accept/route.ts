import { NextResponse } from "next/server";
import { acceptInvitation } from "@/application/use-cases/invitations/accept-invitation";
import { pgInvitationRepository } from "@/infrastructure/db/invitation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { setSessionCookie } from "@/infrastructure/session/cookie";
import { invitationLimiter } from "@/lib/rate-limit";
import { errorResponse } from "../../_lib/errors";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/** POST /api/invitations/accept — acceptation publique d'un lien. */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }

    const honeypot = stringField(body, "website");
    if (honeypot !== undefined && honeypot.trim() !== "") {
      return NextResponse.json({ ok: true });
    }

    const limited = invitationLimiter(`invitation:${clientIp(request)}`);
    if (limited.limited) {
      return NextResponse.json(
        { error: "Trop de tentatives, réessayez plus tard" },
        { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
      );
    }

    const token = stringField(body, "token");
    const name = stringField(body, "name");
    const email = stringField(body, "email");
    const password = stringField(body, "password");
    if (
      token === undefined ||
      name === undefined ||
      email === undefined ||
      password === undefined
    ) {
      return NextResponse.json({ error: "Informations incomplètes" }, { status: 400 });
    }

    const pool = getPool();
    const result = await acceptInvitation(
      {
        invitations: pgInvitationRepository(pool),
        sessions: pgSessionRepository(pool),
      },
      { token, name, email, password },
    );

    await setSessionCookie(result.token, result.expiresAt);
    return NextResponse.json({
      ok: true,
      organization: { id: result.organizationId, name: result.organizationName },
      role: result.role,
      mustChangePassword: result.mustChangePassword,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
