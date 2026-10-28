import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { FicheCollecteForm } from "@/components/fiches-collecte/FicheCollecteForm";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nouvelle fiche de collecte",
};

export default async function NouvelleFicheCollectePage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "fiches_collecte:create")) redirect("/fiches-collecte");

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Fiches de collecte</span>
          <h1 className="text-title">Nouvelle fiche</h1>
        </div>
      </div>
      <FicheCollecteForm fiche={null} />
    </section>
  );
}
