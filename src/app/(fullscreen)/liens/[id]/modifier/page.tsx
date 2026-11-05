import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { linkListItems } from "@/application/use-cases/links/link-urls";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { ChatbotEditPage } from "@/components/links/ChatbotEditPage";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { loadChatbotFormOptions } from "../../chatbot-form-options";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Modifier le chatbot" };

export default async function EditChatbotPage({ params }: { params: Promise<{ id: string }> }) {
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
  const options = await loadChatbotFormOptions(context.actor);
  return <ChatbotEditPage link={{ ...row, createdByLabel: null }} options={options} />;
}
