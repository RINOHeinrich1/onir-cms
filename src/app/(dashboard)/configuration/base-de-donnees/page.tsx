import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DatabaseReaderAccount } from "@/components/database/DatabaseReaderAccount";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuration — Base de données",
};

/** Configuration du compte de lecture (ADR-0026) — super-admin. */
export default async function DatabaseSettingsPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!context.actor.isSuperAdmin) redirect("/");

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Base de données</h1>
          <p className="muted-text">
            Compte PostgreSQL de lecture, partagé par les fonctionnalités qui lisent des données
            (templates ADR-0026 et usages futurs).
          </p>
        </div>
        <div className="tools">
          <a className="btn ghost small" href="/configuration">
            Retour
          </a>
        </div>
      </div>

      <DatabaseReaderAccount />

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2 className="text-title" style={{ fontSize: "1rem" }}>
          Bon à savoir
        </h2>
        <ul className="hint" style={{ paddingLeft: "1.1rem" }}>
          <li>
            Le rôle <code>template_reader</code> (historique) reste le rôle porteur des droits :
            <code>USAGE</code> uniquement sur <code>template_read</code> et <code>SELECT</code> sur
            ses vues.
          </li>
          <li>La rotation reconstruit la connexion au prochain chargement ; aucun redémarrage.</li>
          <li>
            <code>TEMPLATE_DATABASE_URL</code> (si définie) reste prioritaire et désactive la
            rotation depuis cette page.
          </li>
          <li>
            La création des rôles nécessite que le compte applicatif ait <code>CREATEROLE</code>
            (ou soit superutilisateur).
          </li>
        </ul>
      </section>
    </section>
  );
}
