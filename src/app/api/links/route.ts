import { NextResponse } from "next/server";
import { createChatLink } from "@/application/use-cases/links/create-chat-link";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { deleteChatLinks, listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { buildWidgetSnippet, widgetEmbedUrl } from "@/application/use-cases/links/widget-code";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { channelsForLink } from "@/domain/entities/chat";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgChatbotProvisioningRepository } from "@/infrastructure/db/chatbot-provisioning-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { publicLinkBaseUrl } from "@/lib/env";
import { errorResponse } from "../_lib/errors";
import { readJsonObject } from "../_lib/http";
import { requireRole } from "../_lib/require-user";

export const dynamic = "force-dynamic";

/** GET /api/links — liste des liens avec leur URL (admin/marketeur). */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:list");
    const pool = getPool();
    const repository = pgChatLinkRepository(pool);
    const links = await listChatLinks({ links: repository }, actor);
    const items = await linkListItems(repository, links);
    return NextResponse.json({
      links: await attachCreatorLabels(items, pgCreatorNameRepository(pool)),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * POST /api/links — création d'un lien (admin/marketeur).
 * Réponse : lien + jeton en clair (communiqué une seule fois) + URL partageable.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:create");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const pool = getPool();
    const { link, token, knowledge } = await createChatLink(
      {
        links: pgChatLinkRepository(pool),
        prospects: pgProspectRepository(pool),
        confidentialites: pgConfidentialiteRepository(pool),
        visualTemplates: pgVisualTemplateRepository(pool),
        bindings: pgTemplateDataBindingRepository(pool),
        linkDataBindings: pgLinkDataBindingRepository(pool),
        aiProviders: pgAiProviderRepository(pool),
        aiModels: pgAiProviderModelRepository(pool),
        configs: pgChatbotConfigRepository(pool),
        provisioner: pgChatbotProvisioningRepository(pool),
        ficheCollectes: pgFicheCollecteRepository(pool),
      },
      actor,
      body,
    );
    const channels = channelsForLink(link);
    return NextResponse.json(
      {
        link,
        token,
        url: `${publicLinkBaseUrl()}/l/${token}`,
        ...(knowledge === undefined ? {} : { knowledge }),
        ...(channels.widget.enabled
          ? {
              widgetSnippet: buildWidgetSnippet(
                token,
                channels.widget.widgetConfig.position ?? "bottom-right",
              ),
              widgetEmbedUrl: widgetEmbedUrl(token),
            }
          : {}),
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** DELETE /api/links — suppression groupée de chatbots (admin/marketeur). */
export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const actor = await requireRole(request, "links:revoke");
    const body = await readJsonObject(request);
    if (body === null) {
      return NextResponse.json({ error: "Requête invalide" }, { status: 400 });
    }
    const result = await deleteChatLinks(
      { links: pgChatLinkRepository(getPool()) },
      actor,
      body.ids,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return errorResponse(error);
  }
}
