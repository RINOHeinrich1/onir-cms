import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import {
  getOrganizationVisualTemplateCatalog,
  listVisualTemplates,
} from "@/application/use-cases/visual-templates/manage-visual-templates";
import {
  type OrganizationTemplateCard,
  OrganizationTemplatesGrid,
} from "@/components/templates/OrganizationTemplatesGrid";
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
    redirect("/dashboard");
  }

  const repo = pgVisualTemplateRepository(getPool());

  const toCards = async (
    templates: Awaited<ReturnType<typeof listVisualTemplates>>,
  ): Promise<OrganizationTemplateCard[]> =>
    Promise.all(
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

  if (!context.actor.isSuperAdmin) {
    const catalog = await getOrganizationVisualTemplateCatalog({ templates: repo }, context.actor);
    const [installed, available, owned] = await Promise.all([
      toCards(catalog.installed),
      toCards(catalog.available),
      toCards(catalog.owned),
    ]);
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
          </div>
        </div>
        <p className="hint" style={{ marginBottom: "1.5rem" }}>
          Installez les templates de la plateforme ou importez votre propre archive. Les templates
          importés sont privés à votre organisation.
        </p>
        <OrganizationTemplatesGrid
          installed={installed}
          available={available}
          owned={owned}
          ownedCount={catalog.ownedCount}
          ownerLimit={catalog.ownerLimit}
          canManage={actorCan(context.actor, "visualtemplates:upload")}
        />
      </section>
    );
  }

  const templates = await listVisualTemplates({ templates: repo }, context.actor);
  const cards = await toCards(templates);

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
