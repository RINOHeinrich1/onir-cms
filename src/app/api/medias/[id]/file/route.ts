import { NextResponse } from "next/server";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { mediaStorage } from "@/infrastructure/storage";
import { verifyMediaAccess } from "@/lib/media-token";
import { errorResponse } from "../../../_lib/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/medias/[id]/file — sert le fichier d'une photo.
 * Accès autorisé par (1) une session dont l'organisation possède le média, ou
 * (2) une URL signée HMAC courte durée (parcours public). Un accès croisé ou
 * une organisation suspendue renvoie 404. Le média est résolu sans org client.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = await context.params;
    const pool = getPool();
    const medias = pgMediaRepository(pool);

    let media = null;
    const contextData = await getSessionContext();
    const organizationId = contextData?.actor.organizationId ?? null;
    if (organizationId !== null) {
      media = await medias.findById(organizationId, id);
    }
    if (media === null) {
      const token = new URL(request.url).searchParams.get("t");
      const candidate = token === null ? null : await medias.findByIdPublic(id);
      if (
        candidate !== null &&
        token !== null &&
        verifyMediaAccess(token, id, candidate.organizationId)
      ) {
        media = candidate;
      }
    }

    if (media === null || media.type !== "photo" || media.fichier === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const organization = await pgOrganizationRepository(pool).findById(media.organizationId);
    if (organization === null || organization.suspendedAt !== null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const file = await mediaStorage(media.organizationId).read(media.fichier);
    if (file === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": file.contentType || media.mime || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
