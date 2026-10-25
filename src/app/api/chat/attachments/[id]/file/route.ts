import { NextResponse } from "next/server";
import { isImageAttachment } from "@/domain/entities/attachment";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { attachmentStorage } from "@/infrastructure/storage/attachments";
import { verifyAttachmentAccess } from "@/lib/attachment-token";
import { errorResponse } from "../../../../_lib/errors";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** Nom de fichier sûr pour Content-Disposition (ASCII + RFC 5987). */
function disposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * GET /api/chat/attachments/[id]/file — sert une pièce jointe.
 * Accès : session dashboard de la même organisation, ou URL HMAC courte durée.
 */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id } = await context.params;
    const pool = getPool();
    const attachments = pgAttachmentRepository(pool);

    let attachment = null;
    const session = await getSessionContext();
    const organizationId = session?.actor.organizationId ?? null;
    if (organizationId !== null) {
      attachment = await attachments.findById(organizationId, id);
    }
    if (attachment === null) {
      const token = new URL(request.url).searchParams.get("t");
      const candidate = token === null ? null : await attachments.findByIdPublic(id);
      if (
        candidate !== null &&
        token !== null &&
        verifyAttachmentAccess(token, id, candidate.organizationId)
      ) {
        attachment = candidate;
      }
    }
    if (attachment === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const organization = await pgOrganizationRepository(pool).findById(attachment.organizationId);
    if (organization === null || organization.suspendedAt !== null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }

    const file = await attachmentStorage().read(attachment.storageKey);
    if (file === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    const inline =
      new URL(request.url).searchParams.get("inline") === "1" && isImageAttachment(attachment.mime);
    return new Response(new Uint8Array(file.data), {
      headers: {
        "Content-Type": attachment.mime,
        "Content-Disposition": inline
          ? `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`
          : disposition(attachment.originalName),
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
