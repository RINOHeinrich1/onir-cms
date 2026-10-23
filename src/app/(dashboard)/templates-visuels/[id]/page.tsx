import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import { getVisualTemplate } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { TemplateCover } from "@/components/templates/TemplateCover";
import {
  type TemplateVersionSummary,
  TemplateVersionsPanel,
} from "@/components/templates/TemplateVersionsPanel";
import { modeLabel, trustLabel } from "@/components/templates/template-labels";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fiche template",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ version?: string }>;
};

const DATE_FORMAT = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Europe/Paris",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

function trustBadgeClass(trustLevel: string): string {
  return trustLevel === "community" ? "badge muted" : "badge";
}

export default async function VisualTemplatePage({ params, searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "visualtemplates:read")) redirect("/dashboard");

  const { id } = await params;
  const { version: requestedVersion } = await searchParams;
  const templates = pgVisualTemplateRepository(getPool());

  let detail: Awaited<ReturnType<typeof getVisualTemplate>>;
  try {
    detail = await getVisualTemplate({ templates }, context.actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const { template, versions } = detail;
  const latest = versions[0] ?? null;
  const selected =
    requestedVersion === undefined
      ? latest
      : (versions.find((version) => version.version === requestedVersion) ?? latest);
  const versionSummaries: TemplateVersionSummary[] = versions.map((version) => ({
    id: version.id,
    version: version.version,
    mode: version.mode,
    trustLevel: version.trustLevel,
    createdAt: version.createdAt,
  }));

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalogue</span>
          <h1 className="text-title">{template.name}</h1>
          <p className="muted-text">
            {template.key}
            {template.author.trim() === "" ? "" : ` · ${template.author}`}
          </p>
        </div>
        <div className="tools">
          <Link className="btn ghost small" href="/templates-visuels">
            Retour aux templates
          </Link>
          <a className="btn ghost small" href="/documentation/templates-visuels">
            Documentation
          </a>
        </div>
      </div>

      <section className="template-detail-hero card">
        <TemplateCover
          templateId={template.id}
          version={selected?.version ?? null}
          name={template.name}
        />
        <div className="template-detail-hero-body">
          <div className="template-detail-badges">
            {selected !== null ? (
              <>
                <span className={trustBadgeClass(selected.trustLevel)}>
                  {trustLabel(selected.trustLevel)}
                </span>
                <span className="badge muted">{modeLabel(selected.mode)}</span>
                <span className="badge muted">{selected.version}</span>
              </>
            ) : null}
          </div>
          <p>
            {template.description.trim() === ""
              ? "Aucune description fournie."
              : template.description}
          </p>
          <dl className="template-facts">
            <div>
              <dt>Identifiant</dt>
              <dd>
                <code>{template.key}</code>
              </dd>
            </div>
            <div>
              <dt>Versions</dt>
              <dd>{versions.length}</dd>
            </div>
            <div>
              <dt>Auteur</dt>
              <dd>{template.author.trim() === "" ? "—" : template.author}</dd>
            </div>
            <div>
              <dt>Dernière importée</dt>
              <dd>{latest?.version ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="template-detail-layout">
        <TemplateVersionsPanel
          templateId={template.id}
          versions={versionSummaries}
          selectedVersion={selected?.version ?? null}
        />

        <section className="card template-version-summary">
          {selected === null ? (
            <>
              <h2>Aucune version</h2>
              <p className="hint">Ce template ne possède aucune version installée.</p>
            </>
          ) : (
            <>
              <div className="template-version-summary-head">
                <div>
                  <span className="eyebrow">Version sélectionnée</span>
                  <h2>{selected.version}</h2>
                </div>
                <span className={trustBadgeClass(selected.trustLevel)}>
                  {trustLabel(selected.trustLevel)}
                </span>
              </div>

              <dl className="template-version-facts">
                <div>
                  <dt>Importée le</dt>
                  <dd>{formatDate(selected.createdAt)}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{modeLabel(selected.mode)}</dd>
                </div>
                <div>
                  <dt>Protocole</dt>
                  <dd>
                    <code>{selected.hostProtocol}</code>
                  </dd>
                </div>
                <div>
                  <dt>Éditeur</dt>
                  <dd>{selected.manifest.publisher?.name ?? "—"}</dd>
                </div>
              </dl>

              {(selected.manifest.description ?? "").trim() === "" ? null : (
                <p className="template-version-description">{selected.manifest.description}</p>
              )}

              <div className="template-capabilities">
                {(selected.manifest.capabilities ?? []).length === 0 ? (
                  <span className="muted-text">Aucune capacité déclarée.</span>
                ) : (
                  (selected.manifest.capabilities ?? []).map((capability) => (
                    <span key={capability} className="badge muted">
                      {capability}
                    </span>
                  ))
                )}
              </div>

              <p className="hint">
                {(selected.manifest.dataContracts ?? []).length} contrat
                {(selected.manifest.dataContracts ?? []).length > 1 ? "s" : ""} de données ·{" "}
                {(selected.manifest.params ?? []).length} paramètre
                {(selected.manifest.params ?? []).length > 1 ? "s" : ""} · intégrité{" "}
                <code>{selected.integrity.slice(0, 19)}…</code>
              </p>

              <div className="template-version-actions">
                <Link
                  className="btn small"
                  href={`/templates-visuels/${template.id}/donnees?version=${encodeURIComponent(selected.version)}`}
                >
                  Configurer les données
                </Link>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
