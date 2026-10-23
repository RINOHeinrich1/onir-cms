import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import {
  listProspectLinkLabels,
  listProspects,
} from "@/application/use-cases/prospects/list-prospects";
import { ProspectsTable } from "@/components/prospects/ProspectsTable";
import { parseProspectOriginFilter, prospectOriginFilterValue } from "@/domain/entities/prospect";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Prospects",
};

type PageProps = { searchParams: Promise<{ prospect?: string; origine?: string }> };

/**
 * US-PROSPECT-001 — liste des prospects (Server Component, lecture tous rôles).
 * `?prospect=<id>` filtre la liste sur un prospect (lien depuis une fiche).
 * `?origine=manuel|lien:<libellé>` filtre par origine (absent = toutes).
 */
export default async function ProspectsPage({ searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "prospects:list")) {
    redirect("/dashboard");
  }

  const { prospect: filterId, origine: origineParam } = await searchParams;
  const origine = parseProspectOriginFilter(origineParam);
  const pool = getPool();
  const [prospects, linkLabels] = await Promise.all([
    listProspects({ prospects: pgProspectRepository(pool) }, context.actor, origine),
    listProspectLinkLabels({ prospects: pgProspectRepository(pool) }, context.actor),
  ]);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Prospects</h1>
        </div>
      </div>
      <ProspectsTable
        initialProspects={prospects}
        filterProspectId={filterId ?? null}
        origine={prospectOriginFilterValue(origine)}
        linkLabels={linkLabels}
        canWrite={actorCan(context.actor, "prospects:create")}
      />
    </section>
  );
}
