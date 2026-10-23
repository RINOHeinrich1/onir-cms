import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { listTemplates } from "@/application/use-cases/templates/list-templates";
import { TemplatesTable } from "@/components/templates/TemplatesTable";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modèles de raisonnement",
};

/** US-TEMPLATE-001 — gestion des modèles (marketeur/admin, lecture tous rôles). */
export default async function ModelesPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "templates:list")) {
    redirect("/");
  }

  const pool = getPool();
  const templates = await listTemplates(
    { templates: pgChatTemplateRepository(pool) },
    context.actor,
  );
  const templatesWithCreators = await attachCreatorLabels(templates, pgCreatorNameRepository(pool));

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Modèles de raisonnement</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Chaque modèle définit ce que l’assistant demande et la fiche reçue par l’équipe. Partez d’un
        modèle existant pour aller vite, ou créez-en un en mode simple. Toute modification crée une
        nouvelle version — les liens et fiches gardent leur snapshot.
      </p>
      <TemplatesTable
        initialTemplates={templatesWithCreators}
        canWrite={actorCan(context.actor, "templates:create")}
      />
    </section>
  );
}
