import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listFiches } from "@/application/use-cases/fiche/manage-fiches";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { FichesTable } from "@/components/fiches/FichesTable";
import { distinctChatLinkLabels } from "@/domain/entities/chat";
import { parseFicheArchiveFilter } from "@/domain/entities/fiche";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fiches de prospection",
};

type PageProps = { searchParams: Promise<{ filtre?: string; lien?: string }> };

/**
 * US-FICHE-001/002 — liste des fiches de prospection (Server Component).
 * Filtres serveur : archivage (`?filtre=actives|archivees|toutes`, défaut
 * `actives`) et lien de chat (`?lien=<libellé>`, absent = tous).
 */
export default async function FichesPage({ searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "project:read")) {
    redirect("/");
  }

  const { filtre: filtreParam, lien: lienParam } = await searchParams;
  const filtre = parseFicheArchiveFilter(filtreParam);
  const lien = typeof lienParam === "string" ? lienParam : null;

  const pool = getPool();
  const [fiches, prospects, links] = await Promise.all([
    listFiches({ fiches: pgFicheRepository(pool) }, context.actor, filtre, lien),
    listProspects({ prospects: pgProspectRepository(pool) }, context.actor),
    listChatLinks({ links: pgChatLinkRepository(pool) }, context.actor),
  ]);
  const prospectsById = Object.fromEntries(
    prospects.map((prospect) => [
      prospect.id,
      { nom: `${prospect.nom} ${prospect.prenom}`.trim() },
    ]),
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Fiches de prospection</h1>
        </div>
      </div>
      <FichesTable
        initialFiches={fiches}
        prospectsById={prospectsById}
        canWrite={actorCan(context.actor, "project:write")}
        filtre={filtre}
        lien={lien}
        linkLabels={distinctChatLinkLabels(links)}
      />
    </section>
  );
}
