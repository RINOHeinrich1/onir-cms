import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { listChatbotDrafts } from "@/application/use-cases/chatbot-drafts/manage-chatbot-drafts";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { LinksTable } from "@/components/links/LinksTable";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotDraftRepository } from "@/infrastructure/db/chatbot-draft-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
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
  const [links, drafts, aiProviders] = await Promise.all([
    listChatLinks({ links: linkRepository }, context.actor).then((items) =>
      linkListItems(linkRepository, items),
    ),
    listChatbotDrafts({ drafts: pgChatbotDraftRepository(pool) }, context.actor),
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
        aiProviders={aiProviders.map((provider) => ({
          id: provider.id,
          label: provider.label,
          preset: provider.preset,
          defaultModel: provider.defaultModel,
        }))}
        nowIso={new Date().toISOString()}
      />
    </section>
  );
}
