import { NextResponse } from "next/server";
import { errorResponse } from "@/app/api/_lib/errors";
import { requireRole } from "@/app/api/_lib/require-user";
import { organizationOf } from "@/application/actor";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";

/** GET /api/connaissances/scope-options — chatbots sélectionnables comme scope. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "connaissances:create");
    const links = await pgChatLinkRepository(getPool()).list(organizationOf(actor));
    return NextResponse.json({
      chatbots: links
        .map((link) => ({ id: link.id, label: link.label.trim() }))
        .filter((link) => link.label !== "")
        .sort((left, right) => left.label.localeCompare(right.label, "fr")),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
