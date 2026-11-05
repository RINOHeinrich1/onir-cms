import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { ChatbotCreatePage } from "@/components/links/ChatbotCreatePage";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { loadChatbotFormOptions } from "../chatbot-form-options";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Nouveau chatbot" };

export default async function NewChatbotPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "links:create")) redirect("/liens");
  const options = await loadChatbotFormOptions(context.actor);
  return <ChatbotCreatePage options={options} />;
}
