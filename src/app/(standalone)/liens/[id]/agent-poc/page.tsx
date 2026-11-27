import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { AgentPocPanel } from "@/components/agent-poc/AgentPocPanel";
import { type ChatLinkSurface, channelsForLink } from "@/domain/entities/chat";
import { resolveAgentTimeouts } from "@/infrastructure/config/agent-timeouts";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "POC Agent — Édition assistée",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function requestedSurface(value: string | string[] | undefined): ChatLinkSurface | null {
  return value === "page" || value === "widget" ? value : null;
}

export default async function AgentPocPage({ params, searchParams }: PageProps) {
  const sessionContext = await getSessionContext();
  if (sessionContext === null) redirect("/login");
  if (!actorCan(sessionContext.actor, "links:list")) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const organizationId = sessionContext.actor.organizationId;
  if (organizationId === null) notFound();

  const pool = getPool();
  const repository = pgChatLinkRepository(pool);
  const rawLink = await repository.findById(organizationId, id);
  if (rawLink === null) notFound();
  const [link] = await linkListItems(repository, [rawLink]);
  if (link === undefined) notFound();

  const channels = channelsForLink(link);
  const fallback: ChatLinkSurface = channels.page.enabled ? "page" : "widget";
  const surface = requestedSurface(query.surface) ?? fallback;

  const channel = channels[surface];
  return (
    <AgentPocPanel
      linkId={link.id}
      surface={surface}
      initialParams={channel.visualTemplateParams}
      templateId={channel.visualTemplateId}
      templateVersion={channel.visualTemplateVersion}
      label={link.label}
      timeouts={resolveAgentTimeouts()}
    />
  );
}
