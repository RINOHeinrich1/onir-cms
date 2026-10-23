import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listCategories } from "@/application/use-cases/categories/manage-categories";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { CategoriesManager } from "@/components/categories/CategoriesManager";
import { pgCategoryRepository } from "@/infrastructure/db/category-repository";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Catégories",
};

/** ADR-0027 — taxonomie partagée des contenus (médias, connaissances, liens). */
export default async function CategoriesPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "categories:list")) redirect("/dashboard");

  const pool = getPool();
  const categories = await listCategories(
    { categories: pgCategoryRepository(pool) },
    context.actor,
  );
  const categoriesWithCreators = await attachCreatorLabels(
    categories,
    pgCreatorNameRepository(pool),
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Contenus</span>
          <h1 className="text-title">Catégories</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Taxonomie partagée : un média, une connaissance ou un lien peut appartenir à plusieurs
        catégories. Les templates y accèdent via des vues avec une clé de rattachement scalaire.
      </p>
      <CategoriesManager
        initialCategories={categoriesWithCreators}
        canWrite={actorCan(context.actor, "categories:create")}
      />
    </section>
  );
}
