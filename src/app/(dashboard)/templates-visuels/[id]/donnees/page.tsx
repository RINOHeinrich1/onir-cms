import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { TemplateDataBindingsEditor } from "@/components/templates/TemplateDataBindingsEditor";
import { TemplateVersionSelect } from "@/components/templates/TemplateVersionSelect";
import { getPool } from "@/infrastructure/db/pool";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sources de données du template",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * ADR-0026 §11 — configuration des bindings de données d'une version de template
 * pour l'organisation active : requête SQL, assemblage, plafonds, aperçu.
 */
export default async function TemplateDataPage({ params, searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "visualtemplates:read")) redirect("/dashboard");
  const organizationId = context.actor.organizationId;
  if (organizationId === null) redirect("/dashboard");

  const { id } = await params;
  const query = await searchParams;
  const requested = typeof query.version === "string" ? query.version : undefined;

  const pool = getPool();
  const templates = pgVisualTemplateRepository(pool);
  const versions = await templates.listVersions(id);
  if (versions.length === 0) notFound();
  const version =
    requested === undefined ? versions[0] : versions.find((entry) => entry.version === requested);
  if (version === undefined) notFound();

  const contracts = version.manifest.dataContracts ?? [];
  const initialContract = typeof query.contrat === "string" ? query.contrat : undefined;
  const initialSource = typeof query.source === "string" ? query.source : undefined;
  const linkParams = (version.manifest.params ?? []).map((param) => ({
    key: param.key,
    label: param.label,
  }));
  const bindings = await pgTemplateDataBindingRepository(pool).listForVersion(
    organizationId,
    version.id,
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Sources de données</h1>
          <p className="muted-text">
            Version {version.version} · contrats déclarés par le template · organisation active
          </p>
        </div>
        <div className="tools">
          <a className="btn ghost small" href={`/templates-visuels/${id}`}>
            Retour au template
          </a>
          <a className="btn ghost small" href="/documentation/templates-visuels">
            Documentation
          </a>
        </div>
      </div>

      {versions.length > 1 ? (
        <TemplateVersionSelect
          templateId={id}
          versions={versions.map((entry) => entry.version)}
          selectedVersion={version.version}
          {...(initialContract === undefined ? {} : { contrat: initialContract })}
          {...(initialSource === undefined ? {} : { source: initialSource })}
        />
      ) : null}

      {contracts.length === 0 ? (
        <section className="card">
          <h2 className="text-title" style={{ fontSize: "1.1rem" }}>
            Aucune ressource déclarée
          </h2>
          <p className="hint">
            Cette version ne déclare pas de capacité <code>data</code>. Les contrats sont définis
            dans le manifeste du template (<code>data.contracts</code>).
          </p>
        </section>
      ) : (
        <TemplateDataBindingsEditor
          templateId={id}
          version={version.version}
          contracts={contracts}
          bindings={bindings}
          canWrite={actorCan(context.actor, "visualtemplates:create")}
          {...(initialContract === undefined ? {} : { initialContract })}
          {...(initialSource === undefined ? {} : { initialSource })}
          linkParams={linkParams}
        />
      )}
    </section>
  );
}
