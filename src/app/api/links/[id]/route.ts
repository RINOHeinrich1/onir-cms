import { NextResponse } from "next/server";
import { publicUrl } from "@/application/use-cases/links/link-urls";
import { deleteChatLink, updateChatLink } from "@/application/use-cases/links/manage-chat-links";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { errorResponse } from "../../_lib/errors";
import { readJsonObject } from "../../_lib/http";
import { requireRole } from "../../_lib/require-user";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/** PATCH /api/links/[id] — édition globale : libellé + expiration (admin/marketeur). */
export async function PATCH(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:update");
    const { id } = await context.params;
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const repository = pgChatLinkRepository(pool);
    const link = await updateChatLink(
      {
        links: repository,
        visualTemplates: pgVisualTemplateRepository(pool),
        bindings: pgTemplateDataBindingRepository(pool),
        linkDataBindings: pgLinkDataBindingRepository(pool),
        aiProviders: pgAiProviderRepository(pool),
        aiModels: pgAiProviderModelRepository(pool),
        configs: pgChatbotConfigRepository(pool),
      },
      actor,
      id,
      body,
    );
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

/** DELETE /api/links/[id] — suppression définitive (admin/marketeur). */
export async function DELETE(request: Request, context: RouteContext): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:revoke");
    const { id } = await context.params;
    await deleteChatLink({ links: pgChatLinkRepository(getPool()) }, actor, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
