import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WidgetPreviewSite } from "@/components/widgets/WidgetPreviewSite";
import { hashLinkToken } from "@/domain/link-token";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Aperçu du widget",
  robots: { index: false, follow: false },
};

type PageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type WidgetPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left";

const WIDGET_POSITIONS: readonly WidgetPosition[] = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];

function parsePosition(
  value: string | string[] | undefined,
  fallback: WidgetPosition,
): WidgetPosition {
  return typeof value === "string" && (WIDGET_POSITIONS as readonly string[]).includes(value)
    ? (value as WidgetPosition)
    : fallback;
}

/** Aperçu public : reproduit l’intégration réelle du widget sur un site hôte. */
export default async function WidgetPreviewPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const query = await searchParams;
  const link = await pgChatLinkRepository(getPool()).findByTokenHash(hashLinkToken(token.trim()));
  if (link === null || !link.actif) {
    notFound();
  }
  return (
    <WidgetPreviewSite
      token={token}
      position={parsePosition(query.position, link.widgetConfig.position ?? "bottom-right")}
      template={typeof query.template === "string" ? query.template : undefined}
      params={typeof query.params === "string" ? query.params : undefined}
    />
  );
}
