import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { StandalonePublicationCard } from "@/components/links/StandalonePublicationCard";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Déploiement standalone" };

export default async function StandaloneDeploymentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "links:update")) redirect("/liens");
  const { id } = await params;
  const pool = getPool();
  const links = await listChatLinks({ links: pgChatLinkRepository(pool) }, context.actor);
  const link = links.find((entry) => entry.id === id);
  if (link === undefined) notFound();
  const [row] = await linkListItems(pgChatLinkRepository(pool), [link]);
  if (row === undefined) notFound();

  return (
    <section className="chatbot-config-page">
      <div className="page-head">
        <div>
          <Link className="link" href="/liens">
            ← Retour aux chatbots
          </Link>
          <p className="eyebrow">Diffusion</p>
          <h1 className="text-title">Déploiement standalone</h1>
          <p className="mt-2 text-sm text-fg-muted">
            Build statique, domaine personnalisé et état TLS de « {row.label} ».
          </p>
        </div>
      </div>
      <StandalonePublicationCard chatLinkId={row.id} />
    </section>
  );
}
