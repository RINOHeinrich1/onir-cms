import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listConversations } from "@/application/use-cases/conversations/list-conversations";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { ConversationsTable } from "@/components/conversations/ConversationsTable";
import { distinctChatLinkLabels, parseConversationFilter } from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversations",
};

type PageProps = { searchParams: Promise<{ filtre?: string; lien?: string }> };

/**
 * US-CONVERS-001 — suivi des conversations (Server Component).
 * Filtres serveur : statut (`?filtre=en_cours|finalisees|toutes`, défaut
 * en_cours) et lien de chat (`?lien=<libellé>`, absent = tous).
 */
export default async function ConversationsPage({ searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "conversations:list")) {
    redirect("/");
  }

  const { filtre: filtreParam, lien: lienParam } = await searchParams;
  const filtre = parseConversationFilter(filtreParam);
  const lien = typeof lienParam === "string" ? lienParam : null;
  const pool = getPool();
  const [conversations, links] = await Promise.all([
    listConversations(
      { conversations: pgConversationRepository(pool) },
      context.actor,
      filtre,
      lien,
    ),
    listChatLinks({ links: pgChatLinkRepository(pool) }, context.actor),
  ]);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Conversations</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Toutes les discussions ouvertes depuis un lien, finalisées ou non. L&apos;inactivité indique
        le temps écoulé depuis le dernier message.
      </p>
      <ConversationsTable
        initialConversations={conversations}
        filtre={filtre}
        nowIso={new Date().toISOString()}
        canWrite={actorCan(context.actor, "conversations:update")}
        lien={lien}
        linkLabels={distinctChatLinkLabels(links)}
      />
    </section>
  );
}
