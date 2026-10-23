import { NextResponse } from "next/server";
import { createChatLink } from "@/application/use-cases/links/create-chat-link";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { appUrl } from "@/lib/env";
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
    const { link, token } = await createChatLink(
      {
        links: pgChatLinkRepository(pool),
        prospects: pgProspectRepository(pool),
        templates: pgChatTemplateRepository(pool),
        confidentialites: pgConfidentialiteRepository(pool),
        visualTemplates: pgVisualTemplateRepository(pool),
        bindings: pgTemplateDataBindingRepository(pool),
        linkDataBindings: pgLinkDataBindingRepository(pool),
        aiProviders: pgAiProviderRepository(pool),
        aiModels: pgAiProviderModelRepository(pool),
      },
      actor,
      body,
    );
    return NextResponse.json({ link, token, url: `${appUrl()}/l/${token}` }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
