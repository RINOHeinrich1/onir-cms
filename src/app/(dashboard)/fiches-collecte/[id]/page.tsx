import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { getFicheCollecte } from "@/application/use-cases/fiches-collecte/manage-fiche-collectes";
import { FicheCollecteForm } from "@/components/fiches-collecte/FicheCollecteForm";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modifier la fiche de collecte",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EditFicheCollectePage({ params }: PageProps) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "fiches_collecte:read")) redirect("/dashboard");
  if (!actorCan(context.actor, "fiches_collecte:update")) redirect("/fiches-collecte");

  const { id } = await params;
  const fiche = await getFicheCollecte(
    { fiches: pgFicheCollecteRepository(getPool()) },
    context.actor,
    id,
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Fiches de collecte</span>
          <h1 className="text-title">{fiche.label}</h1>
        </div>
      </div>
      <FicheCollecteForm fiche={fiche} />
    </section>
  );
}
