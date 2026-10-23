import { NextResponse } from "next/server";
import { ForbiddenError, NotFoundError } from "@/application/errors";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../_lib/errors";
import { requireRole } from "../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** GET — surcharges de sources du lien (`{ contractKey: bindingId }`). */
export async function GET(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    if (actor.organizationId === null) throw new ForbiddenError("Aucune organisation active");
    const { id } = await context.params;
    const pool = getPool();
    const link = await pgChatLinkRepository(pool).findById(actor.organizationId, id);
    if (link === null) throw new NotFoundError("Lien introuvable");
    const dataBindings = await pgLinkDataBindingRepository(pool).list(id);
    return NextResponse.json({ dataBindings });
  } catch (error) {
    return errorResponse(error);
  }
}
