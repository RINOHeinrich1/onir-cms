import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { getExpirationAlertDays } from "@/application/use-cases/organizations/manage-organization-settings";
import { AppSecretsPanel } from "@/components/app-secrets/AppSecretsPanel";
import { ExpirationAlertSettings } from "@/components/configuration/ExpirationAlertSettings";
import { pgOrganizationSettingsRepository } from "@/infrastructure/db/organization-settings-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuration",
};

/** Configuration de l'organisation et réglages plateforme (super-admin). */
export default async function ConfigurationPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");

  const canConfigureOrganization = actorCan(context.actor, "organizations:update");
  if (!context.actor.isSuperAdmin && !canConfigureOrganization) redirect("/dashboard");

  const organizationId = context.actor.organizationId;
  const expirationAlertDays =
    organizationId === null
      ? null
      : await getExpirationAlertDays(
          { settings: pgOrganizationSettingsRepository(getPool()) },
          organizationId,
        );

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Configuration</h1>
        </div>
      </div>
      <p className="hint" style={{ marginBottom: "1.5rem" }}>
        Réglages de l’organisation active et réglages techniques de la plateforme. Les sections
        plateforme restent réservées au super-administrateur.
      </p>

      {organizationId !== null && expirationAlertDays !== null ? (
        <ExpirationAlertSettings
          initialDays={expirationAlertDays}
          organizationName={context.organization?.name ?? "l’organisation active"}
        />
      ) : null}

      {context.actor.isSuperAdmin ? (
        <>
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

          <AppSecretsPanel />
        </>
      ) : null}
    </section>
  );
}
