import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AssistantWidget } from "@/components/assistant/AssistantWidget";
import { ChatbotBuilderProvider } from "@/components/chatbot-builder/ChatbotBuilderProvider";
import { DashboardHeader } from "@/components/layout/DashboardHeader";
import { NO_ORGANIZATION_PATH } from "@/domain/session";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

/** Coquille pleine page pour les parcours de configuration. */
export default async function FullscreenLayout({ children }: { children: ReactNode }) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (context.user.mustChangePassword) redirect("/change-password");
  if (context.actor.organizationId === null && !context.actor.isSuperAdmin) {
    redirect(NO_ORGANIZATION_PATH);
  }
  const organizations = pgOrganizationRepository(getPool());
  const list = context.actor.isSuperAdmin
    ? await organizations.listAll()
    : await organizations.listForUser(context.user.id);
  return (
    <ChatbotBuilderProvider>
      <div className="dash chatbot-fullscreen-shell">
        <DashboardHeader
          key={`${context.actor.organizationId ?? "none"}:${context.role ?? "none"}`}
          role={context.role ?? "lecteur"}
          email={context.user.email}
          organizations={list.map((organization) => ({
            id: organization.id,
            name: organization.name,
          }))}
          activeOrganizationId={context.actor.organizationId}
          organizationName={context.organization?.name ?? null}
          isSuperAdmin={context.actor.isSuperAdmin}
        />
        <main className="chatbot-fullscreen">{children}</main>
        <AssistantWidget />
      </div>
    </ChatbotBuilderProvider>
  );
}
