import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listFiches } from "@/application/use-cases/fiche/manage-fiches";
import { listChatLinks } from "@/application/use-cases/links/manage-chat-links";
import { listProspects } from "@/application/use-cases/prospects/list-prospects";
import { FichesTable } from "@/components/fiches/FichesTable";
import { LeadFilesTable } from "@/components/leads/LeadFilesTable";
import { distinctChatLinkLabels } from "@/domain/entities/chat";
import type { parseFicheArchiveFilter } from "@/domain/entities/fiche";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leads",
};

type LeadsTab = "fiches" | "fichiers";
type PageProps = {
  searchParams: Promise<{
    onglet?: string;
    filtre?: string;
    archive?: string | string[];
    lien?: string | string[];
  }>;
};

function parseTab(value: string | undefined): LeadsTab {
  return value === "fichiers" ? "fichiers" : "fiches";
}

/** Leads = fiches de prospection + fichiers récupérés (ADR-0034). */
export default async function LeadsPage({ searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "project:read")) redirect("/dashboard");

  const params = await searchParams;
  const tab = parseTab(params.onglet);
  const archiveValues = Array.isArray(params.archive)
    ? params.archive.filter(Boolean)
    : typeof params.archive === "string"
      ? params.archive === ""
        ? []
        : [params.archive]
      : params.filtre === "archivees"
        ? ["archivees"]
        : params.filtre === "toutes"
          ? []
          : ["actives"];
  const filtre: ReturnType<typeof parseFicheArchiveFilter> =
    archiveValues.length === 0
      ? "toutes"
      : archiveValues.includes("archivees") && !archiveValues.includes("actives")
        ? "archivees"
        : archiveValues.includes("actives") && !archiveValues.includes("archivees")
          ? "actives"
          : "toutes";
  const liens = Array.isArray(params.lien)
    ? params.lien
    : typeof params.lien === "string"
      ? [params.lien]
      : [];
  const pool = getPool();

  const fichesData =
    tab === "fiches"
      ? await Promise.all([
          listFiches(
            { fiches: pgFicheRepository(pool) },
            context.actor,
            filtre,
            liens.length > 0 ? liens : null,
          ),
          listProspects({ prospects: pgProspectRepository(pool) }, context.actor),
          listChatLinks({ links: pgChatLinkRepository(pool) }, context.actor),
        ])
      : null;
  const organizationId = context.actor.organizationId;
  const files =
    tab === "fichiers" && organizationId !== null
      ? await pgAttachmentRepository(pool).listForOrganization(organizationId, 1000)
      : [];

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Leads</h1>
        </div>
      </div>

      <nav className="subtabs" aria-label="Sections des leads">
        <a
          href="/leads?onglet=fiches"
          className={`subtab ${tab === "fiches" ? "active" : ""}`}
          aria-current={tab === "fiches" ? "page" : undefined}
        >
          Fiche de prospection
        </a>
        <a
          href="/leads?onglet=fichiers"
          className={`subtab ${tab === "fichiers" ? "active" : ""}`}
          aria-current={tab === "fichiers" ? "page" : undefined}
        >
          Fichiers
        </a>
      </nav>

      {fichesData === null ? (
        <LeadFilesTable files={files} />
      ) : (
        (() => {
          const [fiches, prospects, links] = fichesData;
          const prospectsById = Object.fromEntries(
            prospects.map((prospect) => [
              prospect.id,
              { nom: `${prospect.nom} ${prospect.prenom}`.trim() },
            ]),
          );
          return (
            <FichesTable
              initialFiches={fiches}
              prospectsById={prospectsById}
              canWrite={actorCan(context.actor, "project:write")}
              archive={archiveValues}
              lien={liens}
              linkLabels={distinctChatLinkLabels(links)}
            />
          );
        })()
      )}
    </section>
  );
}
