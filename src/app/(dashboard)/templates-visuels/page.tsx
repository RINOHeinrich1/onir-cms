import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listVisualTemplates } from "@/application/use-cases/visual-templates/manage-visual-templates";
import { VisualTemplatesGrid } from "@/components/templates/VisualTemplatesGrid";
import { getPool } from "@/infrastructure/db/pool";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Templates visuels",
};

/**
 * US-TEMPLATE-001 — onglet « Templates visuels » : importer des bundles
 * `.onirtech-template` (packages UI-only) et consulter les versions installées.
 */
export default async function VisualTemplatesPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "visualtemplates:list")) {
    redirect("/");
  }

  const repo = pgVisualTemplateRepository(getPool());
  const templates = await listVisualTemplates({ templates: repo }, context.actor);
  const cards = await Promise.all(
    templates.map(async (template) => {
      const versions = await repo.listVersions(template.id);
      const latest = versions[0];
      return {
        ...template,
        versionCount: versions.length,
        latest:
          latest === undefined
            ? null
            : {
                version: latest.version,
                mode: latest.mode,
                trustLevel: latest.trustLevel,
              },
      };
    }),
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalogue</span>
          <h1 className="text-title">Templates visuels</h1>
        </div>
        <div className="tools">
          <a className="btn ghost small" href="/documentation/templates-visuels">
            Documentation développeur
          </a>
          <a className="btn ghost small" href="/documentation/sdk">
            SDK des templates
          </a>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Packages UI-only (norme <code>onirtech.template-host.v1</code>) qui personnalisent le chat
        et le formulaire. Un fichier <code>preview.png</code> (16:9) dans le bundle fournit
        l&apos;aperçu de la carte.
      </p>
      <VisualTemplatesGrid initialTemplates={cards} canWrite={context.actor.isSuperAdmin} />
    </section>
  );
}
