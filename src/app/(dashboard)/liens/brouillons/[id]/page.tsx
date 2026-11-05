import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { getChatbotDraft } from "@/application/use-cases/chatbot-drafts/manage-chatbot-drafts";
import { ChatbotCreatePage } from "@/components/links/ChatbotCreatePage";
import { pgChatbotDraftRepository } from "@/infrastructure/db/chatbot-draft-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { loadChatbotFormOptions } from "../../chatbot-form-options";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Reprendre un brouillon" };

export default async function ResumeChatbotDraftPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "links:update")) redirect("/liens");
  const { id } = await params;
  const draft = await getChatbotDraft(
    { drafts: pgChatbotDraftRepository(getPool()) },
    context.actor,
    id,
  ).catch(() => null);
  if (draft === null) notFound();
  const options = await loadChatbotFormOptions(context.actor);
  return <ChatbotCreatePage options={options} draft={{ ...draft, createdByLabel: null }} />;
}
