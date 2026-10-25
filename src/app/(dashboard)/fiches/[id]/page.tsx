import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import { renderFiche } from "@/application/use-cases/fiche/render-fiche";
import { MarkdownReport } from "@/components/fiches/MarkdownReport";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { dashboardAttachmentUrl } from "@/lib/attachment-token";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fiche de prospection",
};

type PageProps = { params: Promise<{ id: string }> };

/**
 * US-FICHE-001 — page de lecture Markdown d'une fiche de prospection.
 * Le même rendu que le téléchargement, affiché directement (lecture tous rôles).
 */
export default async function FicheLecturePage({ params }: PageProps) {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "project:read")) {
    redirect("/dashboard");
  }

  const { id } = await params;
  const pool = getPool();
  const deps = {
    fiches: pgFicheRepository(pool),
    templates: pgChatTemplateRepository(pool),
    prospects: pgProspectRepository(pool),
    attachments: pgAttachmentRepository(pool),
  };

  let rendered: Awaited<ReturnType<typeof renderFiche>>;
  try {
    rendered = await renderFiche(deps, context.actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }
    throw error;
  }

  const { fiche, attachments, markdown } = rendered;
  const organizationId = context.actor.organizationId;
  const prospect =
    fiche.prospectId === null || organizationId === null
      ? null
      : await deps.prospects.findById(organizationId, fiche.prospectId);
  const titreProspect =
    prospect === null ? "Prospect libre" : `${prospect.nom} ${prospect.prenom}`.trim();

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Fiche de prospection</h1>
          <p className="muted-text">
            {titreProspect} · modèle <strong>{fiche.templateKey}</strong> ·{" "}
            {new Date(fiche.createdAt).toLocaleDateString("fr-FR")}
          </p>
        </div>
        <div className="tools">
          <a className="btn ghost small" href="/fiches">
            ← Toutes les fiches
          </a>
          <a className="btn small" href={`/api/fiche/${fiche.id}/download?format=pdf`}>
            PDF
          </a>
          <a className="btn ghost small" href={`/api/fiche/${fiche.id}/download`}>
            Markdown
          </a>
        </div>
      </div>
      <article className="report-doc">
        <MarkdownReport markdown={markdown} />
      </article>

      {attachments.length > 0 ? (
        <section className="card" style={{ marginTop: "1.5rem" }}>
          <h4>Pièces jointes ({attachments.length})</h4>
          <ul className="contact-list">
            {attachments.map((attachment) => (
              <li key={attachment.id}>
                <a
                  className="link"
                  href={dashboardAttachmentUrl(attachment.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {attachment.fieldLabel} — {attachment.originalName}
                </a>{" "}
                <span className="muted-text">
                  ({Math.max(1, Math.round(attachment.sizeBytes / 1024))} Ko)
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
