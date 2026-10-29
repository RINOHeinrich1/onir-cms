import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { listChatbotDrafts } from "@/application/use-cases/chatbot-drafts/manage-chatbot-drafts";
import { listConfidentialites } from "@/application/use-cases/confidentialites/manage-confidentialites";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { listTemplates } from "@/application/use-cases/templates/list-templates";
import { listVisualTemplates } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { LinksTable } from "@/components/links/LinksTable";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgChatbotDraftRepository } from "@/infrastructure/db/chatbot-draft-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Chatbots",
};

/** US-LIENS-001 — génération et gestion des liens de prospection (admin/marketeur). */
export default async function LiensPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "links:list")) {
    redirect("/dashboard");
  }

  const pool = getPool();
  const linkRepository = pgChatLinkRepository(pool);
  const visualTemplateRepo = pgVisualTemplateRepository(pool);
  const [links, drafts, prospects, templates, confidentialites, visualTemplates, aiProviders] =
    await Promise.all([
      listChatLinks({ links: linkRepository }, context.actor).then((items) =>
        linkListItems(linkRepository, items),
      ),
      listChatbotDrafts({ drafts: pgChatbotDraftRepository(pool) }, context.actor),
      listProspects({ prospects: pgProspectRepository(pool) }, context.actor),
      listTemplates({ templates: pgChatTemplateRepository(pool) }, context.actor),
      listConfidentialites({ confidentialites: pgConfidentialiteRepository(pool) }, context.actor),
      listVisualTemplates({ templates: visualTemplateRepo }, context.actor).then((items) =>
        Promise.all(
          items.map(async (item) => ({
            id: item.id,
            name: item.name,
            versions: (await visualTemplateRepo.listVersions(item.id)).map((v) => ({
              version: v.version,
              params: v.manifest.params,
              widget: v.manifest.ui.widget?.display ?? null,
            })),
          })),
        ),
      ),
      listAiProviders({ providers: pgAiProviderRepository(pool) }, context.actor),
    ]);
  const [linksWithCreators, draftsWithCreators] = await Promise.all([
    attachCreatorLabels(links, pgCreatorNameRepository(pool)),
    attachCreatorLabels(drafts, pgCreatorNameRepository(pool)),
  ]);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Chatbots</h1>
        </div>
      </div>
      <LinksTable
        initialLinks={linksWithCreators}
        initialDrafts={draftsWithCreators}
        prospects={prospects}
        templates={templates.map((template) => ({ key: template.key, label: template.label }))}
        confidentialites={confidentialites
          .filter((item) => item.actif)
          .map((item) => ({ id: item.id, titre: item.titre }))}
        visualTemplates={visualTemplates}
        aiProviders={aiProviders.map((provider) => ({
          id: provider.id,
          label: provider.label,
          preset: provider.preset,
          defaultModel: provider.defaultModel,
        }))}
        canAssignAi={actorCan(context.actor, "ai:assign")}
        nowIso={new Date().toISOString()}
      />
    </section>
  );
}
