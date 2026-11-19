import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { loadVisualTemplateOptions } from "@/application/use-cases/visual-templates/visual-template-options";
import type { ChannelDraft } from "@/components/links/LinkChannelsFields";
import { TemplateStudio } from "@/components/studio/TemplateStudio";
import type { StudioLink } from "@/components/studio/types";
import { type ChatLinkChannel, channelsForLink } from "@/domain/entities/chat";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { templateStudioEnabled } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Studio de template (dev)",
  robots: { index: false, follow: false },
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function toDraft(channel: ChatLinkChannel): ChannelDraft {
  return {
    enabled: channel.enabled,
    identificationMode: channel.identificationMode,
    confidentialiteId: channel.confidentialiteId ?? "",
    visualTemplate:
      channel.visualTemplateId === null
        ? ""
        : `${channel.visualTemplateId}@${channel.visualTemplateVersion ?? ""}`,
    params: channel.visualTemplateParams,
    widgetPosition: channel.widgetConfig.position ?? "bottom-right",
  };
}

/**
 * Route de test — studio de personnalisation d'un template visuel.
 * Même contrat que l'aperçu de lien, avec galerie, canevas et inspecteur.
 */
export default async function TemplateStudioPage({ searchParams }: PageProps) {
  if (!templateStudioEnabled()) notFound();

  const session = await getSessionContext();
  if (session === null) redirect("/login");
  if (!actorCan(session.actor, "links:list")) redirect("/dashboard");
  if (session.actor.organizationId === null) notFound();

  const pool = getPool();
  const linkRepository = pgChatLinkRepository(pool);
  const [rawLinks, templates] = await Promise.all([
    listChatLinks({ links: linkRepository }, session.actor),
    loadVisualTemplateOptions(session.actor, pgVisualTemplateRepository(pool)),
  ]);
  const links = await linkListItems(linkRepository, rawLinks);

  const studioLinks: StudioLink[] = links.map((link) => {
    const channels = channelsForLink(link);
    return {
      id: link.id,
      label: link.label === "" ? "Sans nom" : link.label,
      type: link.type,
      url: link.url,
      activeSurface: channels.page.enabled ? "page" : channels.widget.enabled ? "widget" : "page",
      page: toDraft(channels.page),
      widget: toDraft(channels.widget),
    };
  });

  const query = await searchParams;
  const requestedLinkId = typeof query.link === "string" ? query.link : null;
  const initialLinkId =
    studioLinks.find((link) => link.id === requestedLinkId)?.id ?? studioLinks[0]?.id ?? null;

  return (
    <TemplateStudio
      links={studioLinks}
      templates={templates}
      canEdit={actorCan(session.actor, "links:update")}
      initialLinkId={initialLinkId}
    />
  );
}
