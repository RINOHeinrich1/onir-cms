import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { startConversation } from "@/application/use-cases/chat/start-conversation";
import {
  buildLinkContext,
  type LinkTemplateDependencies,
  loadTemplateSpec,
  toContractMessages,
} from "@/application/use-cases/visual-templates/link-template";
import { ChatbotUnavailable } from "@/components/chat/ChatbotUnavailable";
import { TemplateHost } from "@/components/templates/TemplateHost";
import { WidgetReadySignal } from "@/components/templates/WidgetReadySignal";
import { channelsForLink, chatLinkBlockReason } from "@/domain/entities/chat";
import { hashLinkToken } from "@/domain/link-token";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { tryTemplateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Assistant",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

/**
 * Surface widget (ADR-0040) : iframe first-party chargée par `/widget/v2.js`.
 * Aucun header dashboard, aucun formulaire de contact, aucune politique.
 * Le template widget démarre directement en phase `chat`.
 */
export default async function WidgetPage({ params }: PageProps) {
  const { token } = await params;
  const pool = getPool();
  const links = pgChatLinkRepository(pool);
  const link = await links.findByTokenHash(hashLinkToken(token.trim()));
  if (link === null || !link.actif) {
    notFound();
  }
  const channel = channelsForLink(link).widget;
  if (!channel.enabled) {
    notFound();
  }
  const organization = await pgOrganizationRepository(pool).findById(link.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    notFound();
  }
  if (link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now()) {
    notFound();
  }
  const blockReason = chatLinkBlockReason(link);
  if (blockReason !== null) {
    return <ChatbotUnavailable reason={blockReason} surface="widget" />;
  }

  const deps: LinkTemplateDependencies = {
    visualTemplates: pgVisualTemplateRepository(pool),
    medias: pgMediaRepository(pool),
    templates: pgChatTemplateRepository(pool),
  };
  const spec = await loadTemplateSpec(deps, link, "widget", channel);
  if (spec === null) {
    notFound();
  }
  if (spec.dataContracts.some((contract) => contract.loading === "eager")) {
    const dataDeps = await tryTemplateDataDependencies(pool);
    if (dataDeps !== undefined) deps.data = dataDeps;
  }

  if (link.type === "standard") {
    const context = await buildLinkContext(deps, link, spec, {
      phase: "chat",
      messages: [],
      consent: null,
      surface: "widget",
      channel,
    });
    return (
      <main className="widget-page template-page">
        <WidgetReadySignal />
        <TemplateHost
          token={token}
          template={spec}
          baseContext={context}
          conversationId={null}
          initialMessages={[]}
          anonymous
        />
      </main>
    );
  }

  const conversations = pgConversationRepository(pool);
  const started = await startConversation(
    {
      organizations: pgOrganizationRepository(pool),
      links,
      conversations,
      prospects: pgProspectRepository(pool),
    },
    { token, channel: "widget" },
  );
  const messages = await conversations.listMessages(
    started.conversation.organizationId,
    started.conversation.id,
  );
  const contract = toContractMessages(messages, started.conversation.organizationId);
  const context = await buildLinkContext(deps, link, spec, {
    phase: "chat",
    messages: contract,
    consent: null,
    surface: "widget",
    channel,
  });
  return (
    <main className="widget-page template-page">
      <WidgetReadySignal />
      <TemplateHost
        token={token}
        template={spec}
        baseContext={context}
        conversationId={started.conversation.id}
        initialMessages={contract}
      />
    </main>
  );
}
