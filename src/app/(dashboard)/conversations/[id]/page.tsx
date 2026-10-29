import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import { toDashboardChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { getConversation } from "@/application/use-cases/conversations/list-conversations";
import { ConversationActionsMenu } from "@/components/conversations/ConversationActionsMenu";
import { ConversationIncidentBanner } from "@/components/conversations/ConversationIncidentBanner";
import { ConversationInfoPanel } from "@/components/conversations/ConversationInfoPanel";
import { ConversationLive } from "@/components/conversations/ConversationLive";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatOperatorScopeRepository } from "@/infrastructure/db/chat-operator-scope-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversation",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    statut?: string | string[];
    archive?: string | string[];
    lien?: string | string[];
    filtre?: string;
  }>;
};

/**
 * US-CONVERS-001/002 — détail d'une conversation : transcript en lecture,
 * contexte (visiteur, lien, prospect) et génération de la fiche (admin/marketeur).
 */
export default async function ConversationDetailPage({ params, searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "conversations:read")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const query = await searchParams;
  const backParams = new URLSearchParams();
  for (const key of ["statut", "archive", "lien"] as const) {
    const raw = query[key];
    const values = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    for (const value of values) backParams.append(key, value);
  }
  if (query.filtre !== undefined) backParams.set("filtre", query.filtre);
  const backQuery = backParams.toString();
  const backHref = backQuery === "" ? "/conversations" : `/conversations?${backQuery}`;
  const pool = getPool();

  let detail: Awaited<ReturnType<typeof getConversation>>;
  try {
    detail = await getConversation(
      {
        conversations: pgConversationRepository(pool),
        operatorScopes: pgChatOperatorScopeRepository(pool),
        links: pgChatLinkRepository(pool),
        prospects: pgProspectRepository(pool),
        fiches: pgFicheRepository(pool),
      },
      context.actor,
      id,
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const { conversation, messages, link, prospect, fiches } = detail;
  const canIntervene = actorCan(context.actor, "conversations:intervene");
  const canWrite = actorCan(context.actor, "conversations:update");
  const canGenerateFiche = actorCan(context.actor, "conversations:generate_fiche");
  const canSummarize = actorCan(context.actor, "conversations:summarize");
  const canChooseSummaryModel = actorCan(context.actor, "ai:assign");
  const canViewLeads = actorCan(context.actor, "project:read");

  return (
    <section className="conversation-thread-content">
      <header className="conversation-thread-head">
        <div className="conversation-thread-id">
          <a className="icon-btn inbox-back" href={backHref} aria-label="Retour aux conversations">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              aria-hidden
            >
              <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="sr-only">Retour aux conversations</span>
          </a>
          <div>
            <h1>
              {conversation.visitorNom ||
                (conversation.visitorEmail === "" ? "Anonyme" : "Visiteur")}
            </h1>
            <p>
              {conversation.visitorEmail || "—"} · chatbot{" "}
              <strong>{link?.label === "" || link === null ? "sans nom" : link.label}</strong> ·{" "}
              <span className={`badge ${conversation.statut === "finalisee" ? "muted" : ""}`}>
                {conversation.statut === "finalisee" ? "finalisée" : "en cours"}
              </span>
            </p>
          </div>
        </div>
        <ConversationActionsMenu
          conversationId={conversation.id}
          prospectHref={
            prospect !== null && actorCan(context.actor, "prospects:read")
              ? `/prospects?prospect=${prospect.id}`
              : null
          }
          archivee={conversation.archivee === true}
          canWrite={canWrite}
          canGenerateFiche={canGenerateFiche}
          canViewLeads={canViewLeads}
        />
      </header>
      <ConversationInfoPanel
        conversationId={conversation.id}
        showTrigger={false}
        summary={{
          canSummarize,
          canChooseModel: canChooseSummaryModel,
          finalized: conversation.statut === "finalisee",
        }}
      />

      <ConversationIncidentBanner conversationId={conversation.id} canIntervene={canIntervene} />

      {fiches.length > 0 ? (
        <section style={{ marginTop: "1.5rem" }}>
          <h4>Fiches générées ({fiches.length})</h4>
          <ul className="contact-list">
            {fiches.map((item) => (
              <li key={item.id}>
                {canViewLeads ? (
                  <a className="link" href={`/leads/${item.id}`}>
                    {item.templateKey} · {new Date(item.createdAt).toLocaleString("fr-FR")}
                    {item.archivee ? " · archivée" : ""}
                  </a>
                ) : (
                  <span>
                    {item.templateKey} · {new Date(item.createdAt).toLocaleString("fr-FR")}{" "}
                    <a
                      className="link"
                      href={`/api/conversations/${conversation.id}/fiches/${item.id}/download?format=pdf`}
                    >
                      PDF
                    </a>{" "}
                    <a
                      className="link"
                      href={`/api/conversations/${conversation.id}/fiches/${item.id}/download?format=md`}
                    >
                      Markdown
                    </a>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <ConversationLive
        conversation={conversation}
        initialMessages={messages.map(toDashboardChatMessage)}
        canIntervene={canIntervene}
        assistantLabel={link === null || link.label === "" ? "Chatbot sans nom" : link.label}
      />
    </section>
  );
}
