import { NextResponse } from "next/server";
import { login } from "@/application/use-cases/auth/login";
import { pgMembershipRepository } from "@/infrastructure/db/membership-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgSessionRepository } from "@/infrastructure/db/session-repository";
import { pgUserRepository } from "@/infrastructure/db/user-repository";
import { setSessionCookie } from "@/infrastructure/session/cookie";
import { loginLimiter } from "@/lib/rate-limit";
import { clientIp, readJsonObject, stringField } from "../../_lib/http";

export const dynamic = "force-dynamic";

/** POST /api/auth/login — US-AUTH-001 (honeypot + rate limit). */
export async function POST(request: Request): Promise<NextResponse> {
  const body = await readJsonObject(request);
  if (body === null) {
    return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
  }

  // Honeypot : un champ « website » rempli signale un bot → réponse neutre.
  const honeypot = stringField(body, "website");
  if (honeypot !== undefined && honeypot.trim() !== "") {
    return NextResponse.json({ ok: true });
  }

  const email = stringField(body, "email");
  const password = stringField(body, "password");
  if (email === undefined || password === undefined) {
    return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
  }

  const limited = loginLimiter(`login:${clientIp(request)}`);
  if (limited.limited) {
    return NextResponse.json(
      { error: "Trop de tentatives, réessayez plus tard" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSeconds) } },
    );
  }

  const pool = getPool();
  const result = await login(
    {
      users: pgUserRepository(pool),
      sessions: pgSessionRepository(pool),
      organizations: pgOrganizationRepository(pool),
      memberships: pgMembershipRepository(pool),
    },
    { email, password },
  );

  if (!result.ok) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
  }

  await setSessionCookie(result.token, result.expiresAt);
  const active =
    result.organizations.find((organization) => organization.id === result.activeOrganizationId) ??
    null;
  return NextResponse.json({
    ok: true,
    role: result.role,
    organization: active,
    organizations: result.organizations,
    mustChangePassword: result.mustChangePassword,
  });
}
