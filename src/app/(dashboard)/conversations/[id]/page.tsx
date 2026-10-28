import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import { toDashboardChatMessage } from "@/application/use-cases/attachments/attachment-dto";
import { getConversation } from "@/application/use-cases/conversations/list-conversations";
import { ConversationLive } from "@/components/conversations/ConversationLive";
import { GenerateFicheButton } from "@/components/conversations/GenerateFicheButton";
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

type PageProps = { params: Promise<{ id: string }> };

/**
 * US-CONVERS-001/002 — détail d'une conversation : transcript en lecture,
 * contexte (visiteur, lien, prospect) et génération de la fiche (admin/marketeur).
 */
export default async function ConversationDetailPage({ params }: PageProps) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "conversations:read")) {
    redirect("/dashboard");
  }

  const { id } = await params;
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
  const canGenerateFiche = actorCan(context.actor, "conversations:generate_fiche");
  const canViewLeads = actorCan(context.actor, "project:read");

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Conversation</span>
          <h1 className="text-title">
            {conversation.visitorNom || (conversation.visitorEmail === "" ? "Anonyme" : "Visiteur")}
          </h1>
          <p className="muted-text">
            {conversation.visitorEmail || "—"} · lien{" "}
            <strong>{link?.label === "" || link === null ? "sans nom" : link.label}</strong> ·{" "}
            <span className={`badge ${conversation.statut === "finalisee" ? "muted" : ""}`}>
              {conversation.statut === "finalisee" ? "finalisée" : "en cours"}
            </span>
          </p>
        </div>
        <div className="tools">
          <a className="btn ghost small" href="/conversations">
            ← Toutes
          </a>
          {prospect !== null && actorCan(context.actor, "prospects:read") ? (
            <a className="btn ghost small" href={`/prospects?prospect=${prospect.id}`}>
              Prospect
            </a>
          ) : null}
          {canGenerateFiche ? (
            <GenerateFicheButton conversationId={conversation.id} canViewLeads={canViewLeads} />
          ) : null}
        </div>
      </div>

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
      />
    </section>
  );
}
