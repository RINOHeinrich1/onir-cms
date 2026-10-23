import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listMedias } from "@/application/use-cases/medias/manage-medias";
import { attachCreatorLabels } from "@/application/use-cases/shared/creator-labels";
import { MediasManager } from "@/components/medias/MediasManager";
import { pgCreatorNameRepository } from "@/infrastructure/db/creator-name-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Médias",
};

/**
 * US-MEDIA-001 — médiathèque : photothèque et liens proposables par l'IA
 * (lecture tous rôles). Deux sous-onglets côté client.
 */
export default async function MediasPage() {
  const context = await getSessionContext();
  if (context === null) {
    redirect("/login");
  }
  if (!actorCan(context.actor, "medias:list")) {
    redirect("/dashboard");
  }

  const pool = getPool();
  const medias = await listMedias({ medias: pgMediaRepository(pool) }, context.actor);
  const mediasWithCreators = await attachCreatorLabels(medias, pgCreatorNameRepository(pool));

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Prospection</span>
          <h1 className="text-title">Médias</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Photos et liens que l&apos;IA peut proposer au visiteur (libellé exact, portée globale ou
        par modèle). Seules les sources cochées sur un lien de chat sont recherchées ; les images
        apparaissent après la réponse.
      </p>
      <MediasManager
        initialMedias={mediasWithCreators}
        canWrite={actorCan(context.actor, "medias:create")}
      />
    </section>
  );
}
