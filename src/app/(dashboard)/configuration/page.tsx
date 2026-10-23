import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuration",
};

/** Configuration plateforme — réservée au super-administrateur. */
export default async function ConfigurationPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!context.actor.isSuperAdmin) redirect("/dashboard");

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Configuration</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Réglages techniques de la plateforme. Chaque section est réservée au super-administrateur et
        s'applique à toutes les organisations.
      </p>

      <div className="grid-2">
        <a
          className="card"
          href="/configuration/base-de-donnees"
          style={{ textDecoration: "none" }}
        >
          <h2 className="text-title" style={{ fontSize: "1.05rem" }}>
            Base de données
          </h2>
          <p className="hint">
            Compte de lecture en lecture seule utilisé par les fonctionnalités qui lisent des
            données : état, test et rotation du mot de passe.
          </p>
          <span className="btn ghost small">Ouvrir</span>
        </a>
      </div>
    </section>
  );
}
