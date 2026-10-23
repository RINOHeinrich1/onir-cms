import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listConnaissances } from "@/application/use-cases/connaissances/manage-connaissances";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { ConnaissancesTable } from "@/components/connaissances/ConnaissancesTable";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Connaissances",
};

/** US-CONNAISS-001 — base de connaissances du mini-RAG (lecture tous rôles). */
export default async function ConnaissancesPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "connaissances:list")) {
    redirect("/");
  }

  const pool = getPool();
  const connaissances = await listConnaissances(
    { connaissances: pgConnaissanceRepository(pool) },
    context.actor,
  );
  const connaissancesWithCreators = await attachCreatorLabels(
    connaissances,
    pgCreatorNameRepository(pool),
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Connaissances</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Informations internes que l&apos;IA choisit elle-même d&apos;utiliser pour répondre (titre
        exact, portée globale ou par modèle). Sans entrée active, le chat répond normalement.
      </p>
      <ConnaissancesTable
        initialConnaissances={connaissancesWithCreators}
        canWrite={actorCan(context.actor, "connaissances:create")}
      />
    </section>
  );
}
