import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LimitProfilesManager } from "@/components/limit-profiles/LimitProfilesManager";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Profils de limites",
};

export default async function LimitProfilesPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!context.actor.isSuperAdmin) redirect("/dashboard");
  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Plateforme</span>
          <h1 className="text-title">Profils de limites</h1>
          <p className="hint">
            Préréglages réutilisables pour les invitations : chatbots, budgets IA et ressources
            autorisées.
          </p>
        </div>
      </div>
      <LimitProfilesManager />
    </section>
  );
}
