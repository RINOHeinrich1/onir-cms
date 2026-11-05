import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { NO_ORGANIZATION_PATH } from "@/domain/session";
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
  return <main className="chatbot-fullscreen">{children}</main>;
}
