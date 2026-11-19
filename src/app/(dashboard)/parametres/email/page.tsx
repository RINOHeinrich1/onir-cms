import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { EmailSettingsPanel } from "@/components/email/EmailSettingsPanel";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Email et OTP" };

export default async function EmailSettingsPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  const canRead = actorCan(context.actor, "emailsettings:read");
  const canManage = actorCan(context.actor, "emailsettings:manage");
  if (!canRead && !context.actor.isSuperAdmin) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Paramètres</p>
        <h1 className="text-title">Email et OTP</h1>
        <p className="mt-2 text-sm text-fg-muted">
          Transport SMTP utilisé pour les codes d’identification par email.
        </p>
      </div>
      <EmailSettingsPanel
        scope="organization"
        title="SMTP de l’organisation"
        description="Utilisé en priorité. S’il est absent, le défaut plateforme prend le relais."
        canEdit={canManage}
      />
      {context.actor.isSuperAdmin ? (
        <EmailSettingsPanel
          scope="platform"
          title="SMTP par défaut de la plateforme"
          description="Utilisé uniquement pour les organisations qui n’ont aucun SMTP configuré."
          canEdit
        />
      ) : null}
    </div>
  );
}
