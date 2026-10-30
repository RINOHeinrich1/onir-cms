import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { toPublicChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { resolveCurrentConfig } from "@/application/use-cases/chat/chatbot-config-runtime";
import { startConversation } from "@/application/use-cases/chat/start-conversation";
import {
  buildLinkContext,
  type LinkTemplateDependencies,
  loadTemplateSpec,
  toContractMessages,
} from "@/application/use-cases/visual-templates/link-template";
import { ChatbotUnavailable } from "@/components/chat/ChatbotUnavailable";
import { ChatPortal } from "@/components/chat/ChatPortal";
import { ChatWindow } from "@/components/chat/ChatWindow";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { AnonymousTemplatePortal } from "@/components/templates/AnonymousTemplatePortal";
import { TemplateHost } from "@/components/templates/TemplateHost";
import { TemplateLoader } from "@/components/templates/TemplateLoader";
import { channelsForLink, chatLinkBlockReason } from "@/domain/entities/chat";
import { hashLinkToken } from "@/domain/link-token";
import type { TemplateFormField } from "@/domain/template-contract";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { tryTemplateDataDependencies } from "@/infrastructure/db/template-data-runtime";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { isBotUserAgent } from "@/lib/visit-tracking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Discussion",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

/** En-tête commun au portail : marque, titre, présence de l'assistant. */
function ChatHeader({ title }: { title: string }) {
  return (
    <header className="chat-page-header">
      <span className="brand brand-logo">
        <BrandLogo />
      </span>
      <div className="chat-heading">
        <h1 className="chat-page-title">{title}</h1>
        <span className="chat-status">
          <span className="chat-status-dot" aria-hidden="true" />
          Assistant en ligne
        </span>
      </div>
    </header>
  );
}

/**
 * Portail public de chat partagé (B034) — US-LIENS-001.
 * Lien `specifique` : conversation créée d'emblée (contexte prospect).
 * Lien `standard` : identification du visiteur d'abord (`ContactGate`).
 * Si un **template visuel** est rattaché, l'interface est rendue par le shell hôte
 * (ADR-0019) ; sinon l'UI par défaut (dite « default »).
 */
export default async function ChatPortalPage({ params }: PageProps) {
  const { token } = await params;
  const pool = getPool();
  const links = pgChatLinkRepository(pool);
  const link = await links.findByTokenHash(hashLinkToken(token.trim()));
  if (link === null || !link.actif) {
    notFound();
  }
  const channel = channelsForLink(link).page;
  if (!channel.enabled) {
    notFound();
  }
  const organization = await pgOrganizationRepository(pool).findById(link.organizationId);
  if (organization === null || organization.suspendedAt !== null) {
    notFound();
  }
  if (link.expiresAt !== null && new Date(link.expiresAt).getTime() <= Date.now()) {
    return (
      <main className="chat-page">
        <ChatHeader title="Discussion" />
        <div className="chat-gate">
          <section className="card">
            <h2>Lien expiré</h2>
            <p className="hint">
              Ce lien de discussion a expiré. Demandez un nouveau lien à votre interlocuteur.
            </p>
          </section>
        </div>
      </main>
    );
  }
  const blockReason = chatLinkBlockReason(link);
  if (blockReason !== null) {
    return <ChatbotUnavailable reason={blockReason} />;
  }

  const reasoning = await pgChatTemplateRepository(pool).findVersion(
    link.organizationId,
    link.templateKey,
    link.templateVersion,
  );
  const config = await resolveCurrentConfig(
    pgChatbotConfigRepository(pool),
    link.organizationId,
    link,
  );
  const canFinish = reasoning !== null || (config?.fiches.length ?? 0) > 0;
  const attachmentFields: TemplateFormField[] =
    reasoning?.definition.fields
      .filter((field) => field.type === "file")
      .map((field) => ({
        name: field.name,
        label: field.label,
        type: "file",
        required: field.required,
        ...(field.file === undefined
          ? {}
          : {
              accept: field.file.accept,
              maxFiles: field.file.maxFiles,
              maxBytes: field.file.maxBytes,
            }),
      })) ?? [];

  const requestHeaders = await headers();
  if (!isBotUserAgent(requestHeaders.get("user-agent"))) {
    // Le compteur est accessoire : une panne d'écriture ne doit jamais bloquer le chat.
    await links.recordVisit(link.organizationId, link.id).catch(() => undefined);
  }

  const deps: LinkTemplateDependencies = {
    visualTemplates: pgVisualTemplateRepository(pool),
    medias: pgMediaRepository(pool),
    templates: pgChatTemplateRepository(pool),
  };
  const spec = await loadTemplateSpec(deps, link, "page", channel);
  if (spec?.dataContracts.some((contract) => contract.loading === "eager")) {
    const dataDeps = await tryTemplateDataDependencies(pool);
    if (dataDeps !== undefined) deps.data = dataDeps;
  }

  let consent: { texte: string; lien: string } | null = null;
  if (channel.confidentialiteId !== null) {
    const policy = await pgConfidentialiteRepository(pool).findById(
      link.organizationId,
      channel.confidentialiteId,
    );
    if (policy?.actif === true) consent = { texte: policy.texte, lien: policy.lien };
  }

  if (link.type === "standard" && channel.identificationMode === "anonymous") {
    if (spec !== null) {
      const context = await buildLinkContext(deps, link, spec, {
        phase: "chat",
        messages: [],
        consent,
        surface: "page",
        channel,
      });
      return (
        <main className="chat-page template-page">
          <TemplateLoader />
          <AnonymousTemplatePortal
            token={token}
            template={spec}
            baseContext={context}
            confidentialite={consent}
          />
        </main>
      );
    }
    return (
      <main className="chat-page">
        <ChatHeader title="Discussion anonyme" />
        <ChatPortal
          token={token}
          confidentialite={consent}
          anonymous
          attachmentFields={attachmentFields}
        />
      </main>
    );
  }

  if (link.type === "standard") {
    if (spec !== null) {
      const context = await buildLinkContext(deps, link, spec, {
        phase: "identity",
        messages: [],
        consent,
        surface: "page",
        channel,
      });
      return (
        <main className="chat-page template-page">
          <TemplateLoader />
          <TemplateHost
            token={token}
            template={spec}
            baseContext={context}
            conversationId={null}
            initialMessages={[]}
          />
        </main>
      );
    }
    return (
      <main className="chat-page">
        <ChatHeader title="Discussion" />
        <ChatPortal
          token={token}
          confidentialite={consent}
          attachmentFields={attachmentFields}
          canFinish={canFinish}
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
    { token, channel: "page" },
  );
  const messages = await conversations.listMessages(
    started.conversation.organizationId,
    started.conversation.id,
  );
  const titre = started.prospect
    ? `Discussion avec ${started.prospect.nom} ${started.prospect.prenom}`.trim()
    : "Discussion";

  if (spec !== null) {
    const contract = toContractMessages(messages, started.conversation.organizationId);
    const context = await buildLinkContext(deps, link, spec, {
      phase: "chat",
      messages: contract,
      consent,
      surface: "page",
      channel,
    });
    return (
      <main className="chat-page template-page">
        <TemplateLoader />
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

  return (
    <main className="chat-page">
      <ChatHeader title={titre} />
      <ChatWindow
        conversationId={started.conversation.id}
        initialMessages={messages.map((message) =>
          toPublicChatMessage(message, started.conversation.organizationId),
        )}
        attachmentFields={attachmentFields}
        canFinish={canFinish}
      />
    </main>
  );
}
