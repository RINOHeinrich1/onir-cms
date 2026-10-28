import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listFicheCollectes } from "@/application/use-cases/fiches-collecte/manage-fiche-collectes";
import { FichesCollecteTable } from "@/components/fiches-collecte/FichesCollecteTable";
import { pgFicheCollecteRepository } from "@/infrastructure/db/fiche-collecte-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fiches de collecte",
};

/** Fiches de collecte réutilisables (ADR-0049). */
export default async function FichesCollectePage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "fiches_collecte:list")) redirect("/dashboard");

  const fiches = await listFicheCollectes(
    { fiches: pgFicheCollecteRepository(getPool()) },
    context.actor,
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Fiches de collecte</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Fiches réutilisables, indépendantes des chatbots. Une fiche importée dans un chatbot est
        copiée : les modifications ultérieures créent une nouvelle version sans affecter les
        chatbots existants.
      </p>
      <FichesCollecteTable
        initialFiches={fiches}
        canWrite={actorCan(context.actor, "fiches_collecte:create")}
      />
    </section>
  );
}
