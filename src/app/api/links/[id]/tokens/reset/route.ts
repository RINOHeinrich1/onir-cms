import { NextResponse } from "next/server";
import { publicUrl } from "@/application/use-cases/links/link-urls";
import { resetChatLinkTokens } from "@/application/use-cases/links/manage-chat-links";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { errorResponse } from "../../../../_lib/errors";
import { requireRole } from "../../../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** POST /api/links/[id]/tokens/reset — réinitialise le budget tokens courant. */
export async function POST(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const pool = getPool();
    const repository = pgChatLinkRepository(pool);
    const link = await resetChatLinkTokens({ links: repository }, actor, id);
    const organizationId = actor.organizationId;
    if (organizationId === null) {
      return NextResponse.json({ error: "Introuvable" }, { status: 404 });
    }
    const [item] = await attachCreatorLabels(
      [
        {
          ...link,
          url: publicUrl(await repository.getTokenEnc(organizationId, link.id)),
        },
      ],
      pgCreatorNameRepository(pool),
    );
    return NextResponse.json({ link: item });
  } catch (error) {
    return errorResponse(error);
  }
}
