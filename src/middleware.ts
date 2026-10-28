import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/domain/session";

/**
 * Protection globale des routes privées (A050).
 * Le middleware Edge ne peut pas interroger PostgreSQL : il vérifie la PRÉSENCE
 * du cookie de session ; la validation réelle (session en base, expiration,
 * compte actif) est faite dans les layouts/routes serveur.
 */
export function middleware(request: NextRequest): NextResponse {
  const hasSession = request.cookies.has(SESSION_COOKIE);
  if (hasSession) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    "/dashboard",
    "/organisations/:path*",
    "/utilisateurs/:path*",
    "/invitations/:path*",
    "/prospects/:path*",
    "/liens/:path*",
    "/fiches/:path*",
    "/fiches-collecte/:path*",
    "/leads/:path*",
    "/conversations/:path*",
    "/connaissances/:path*",
    "/medias/:path*",
    "/confidentialites/:path*",
    "/templates-visuels/:path*",
  ],
};
