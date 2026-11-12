import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { AiProvidersPanel } from "@/components/ai/AiProvidersPanel";
import type { AiProviderDto } from "@/components/ai/types";
import { AppSecretsPanel } from "@/components/app-secrets/AppSecretsPanel";
import { DatabaseReaderAccount } from "@/components/database/DatabaseReaderAccount";
import { ensureAppSecretsLoaded, getAppSecret } from "@/infrastructure/config/app-secrets";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { legacyAiCredentials } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuration",
};

type ConfigurationTab = "ia" | "database" | "secrets";

function selectedTab(
  requested: string | undefined,
  available: readonly ConfigurationTab[],
): ConfigurationTab {
  const normalized =
    requested === "technique" || requested === "base-de-donnees" ? "database" : requested;
  return available.includes(normalized as ConfigurationTab)
    ? (normalized as ConfigurationTab)
    : (available[0] ?? "ia");
}

/** Configuration de l'organisation, IA et réglages techniques. */
export default async function ConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");

  const canManageAi = actorCan(context.actor, "ai:list");
  if (!context.actor.isSuperAdmin && !canManageAi) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const pool = getPool();

  let providers: AiProviderDto[] = [];
  let aiKeyReady = true;
  if (canManageAi) {
    providers = await listAiProviders({ providers: pgAiProviderRepository(pool) }, context.actor, {
      includeArchived: true,
    });
    await ensureAppSecretsLoaded();
    try {
      getAppSecret("AI_PROVIDER_KEY");
    } catch {
      aiKeyReady = false;
    }
  }

  const availableTabs: ConfigurationTab[] = [
    ...(canManageAi ? (["ia"] as const) : []),
    ...(context.actor.isSuperAdmin ? (["database", "secrets"] as const) : []),
  ];
  const tab = selectedTab(params.tab, availableTabs);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Configuration</h1>
          <p className="muted-text">
            Intelligence artificielle, base de données et secrets applicatifs réunis ici.
          </p>
        </div>
      </div>

      <div className="page-tabs channel-tabs" role="tablist" aria-label="Sections de configuration">
        {canManageAi ? (
          <a
            className="channel-tab"
            role="tab"
            aria-selected={tab === "ia"}
            href="/configuration?tab=ia"
          >
            Intelligence artificielle
          </a>
        ) : null}
        {context.actor.isSuperAdmin ? (
          <a
            className="channel-tab"
            role="tab"
            aria-selected={tab === "database"}
            href="/configuration?tab=database"
          >
            Base de données
          </a>
        ) : null}
        {context.actor.isSuperAdmin ? (
          <a
            className="channel-tab"
            role="tab"
            aria-selected={tab === "secrets"}
            href="/configuration?tab=secrets"
          >
            Secrets applicatifs
          </a>
        ) : null}
      </div>

      {tab === "ia" ? (
        <section>
          {!aiKeyReady ? (
            <p className="alert error">
              La clé de chiffrement des fournisseurs IA n’est pas disponible. Un super-admin doit la
              configurer dans{" "}
              <a href="/configuration?tab=secrets">Configuration → Secrets applicatifs</a>. Le chat
              legacy continue de fonctionner.
            </p>
          ) : null}
          <div className="page-head" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="text-title" style={{ fontSize: "1.35rem" }}>
                Intelligence artificielle
              </h2>
              <p className="hint">
                Fournisseurs OpenAI-compatible, modèles, clusters et défauts par usage.
              </p>
            </div>
            <a className="btn ghost small" href="/parametres/ia/test">
              Page de test
            </a>
          </div>
          <AiProvidersPanel
            initialProviders={providers}
            canManage={actorCan(context.actor, "ai:manage")}
            legacyAvailable={legacyAiCredentials() !== null}
          />
        </section>
      ) : null}

      {tab === "database" && context.actor.isSuperAdmin ? (
        <section>
          <div className="page-head" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="text-title" style={{ fontSize: "1.35rem" }}>
                Base de données
              </h2>
              <p className="hint">
                Compte PostgreSQL de lecture, partagé par les fonctionnalités qui lisent des
                données.
              </p>
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
                <code>USAGE</code> uniquement sur <code>template_read</code> et <code>SELECT</code>{" "}
                sur ses vues.
              </li>
              <li>
                La rotation reconstruit la connexion au prochain chargement ; aucun redémarrage.
              </li>
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
      ) : null}

      {tab === "secrets" && context.actor.isSuperAdmin ? (
        <section>
          <div className="page-head" style={{ marginBottom: "1rem" }}>
            <div>
              <h2 className="text-title" style={{ fontSize: "1.35rem" }}>
                Secrets applicatifs
              </h2>
              <p className="hint">Clés de chiffrement et secrets techniques de la plateforme.</p>
            </div>
          </div>
          <AppSecretsPanel />
        </section>
      ) : null}
    </section>
  );
}
