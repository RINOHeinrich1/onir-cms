import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WidgetPreviewSite } from "@/components/widgets/WidgetPreviewSite";
import { channelsForLink } from "@/domain/entities/chat";
import { hashLinkToken } from "@/domain/link-token";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aperçu du widget",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ token: string }> };

/** Aperçu public : reproduit l’intégration réelle du widget sur un site hôte. */
export default async function WidgetPreviewPage({ params }: PageProps) {
  const { token } = await params;
  const link = await pgChatLinkRepository(getPool()).findByTokenHash(hashLinkToken(token.trim()));
  if (link === null || !link.actif || !channelsForLink(link).widget.enabled) {
    notFound();
  }
  return (
    <WidgetPreviewSite token={token} position={link.widgetConfig.position ?? "bottom-right"} />
  );
}
