import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { actorCan } from "@/application/actor";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { ConversationsWorkspace } from "@/components/conversations/ConversationsWorkspace";
import { distinctChatLinkLabels } from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Conversations",
};

/** Shell persistant de l’inbox : liste à gauche, conversation à droite. */
export default async function ConversationsLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "conversations:list")) {
    redirect("/dashboard");
  }

  const links = actorCan(context.actor, "links:list")
    ? await listChatLinks({ links: pgChatLinkRepository(getPool()) }, context.actor)
    : [];

  return (
    <Suspense fallback={<div className="skeleton inbox-workspace-skeleton" />}>
      <ConversationsWorkspace
        linkLabels={distinctChatLinkLabels(links)}
        canWrite={actorCan(context.actor, "conversations:update")}
        canGenerateFiche={actorCan(context.actor, "conversations:generate_fiche")}
        canViewLeads={actorCan(context.actor, "project:read")}
        canViewProspects={actorCan(context.actor, "prospects:read")}
      >
        {children}
      </ConversationsWorkspace>
    </Suspense>
  );
}
