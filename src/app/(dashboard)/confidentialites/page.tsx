import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listConfidentialites } from "@/application/use-cases/confidentialites/manage-confidentialites";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { ConfidentialitesTable } from "@/components/confidentialites/ConfidentialitesTable";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Confidentialité",
};

/**
 * US-CONFID-001 — politiques de confidentialité : texte + lien, rattachées à un
 * lien de chat ; le consentement du visiteur est horodaté sur la conversation.
 */
export default async function ConfidentialitesPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "confidentialites:list")) {
    redirect("/dashboard");
  }

  const pool = getPool();
  const confidentialites = await listConfidentialites(
    { confidentialites: pgConfidentialiteRepository(pool) },
    context.actor,
  );
  const confidentialitesWithCreators = await attachCreatorLabels(
    confidentialites,
    pgCreatorNameRepository(pool),
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Confidentialité</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Politiques de confidentialité paramétrables (texte du consentement + lien). Chaque lien de
        chat peut être rattaché à une politique ; le visiteur doit l&apos;accepter avant de
        discuter.
      </p>
      <ConfidentialitesTable
        initialConfidentialites={confidentialitesWithCreators}
        canWrite={actorCan(context.actor, "confidentialites:create")}
      />
    </section>
  );
}
