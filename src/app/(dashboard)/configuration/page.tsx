import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { AiProvidersPanel } from "@/components/ai/AiProvidersPanel";
import type { AiProviderDto } from "@/components/ai/types";
import { AppSecretsPanel } from "@/components/app-secrets/AppSecretsPanel";
import { ensureAppSecretsLoaded, getAppSecret } from "@/infrastructure/config/app-secrets";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { legacyAiCredentials } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Configuration",
};

type ConfigurationTab = "ia" | "technique";

function selectedTab(
  requested: string | undefined,
  available: readonly ConfigurationTab[],
): ConfigurationTab {
  return available.includes(requested as ConfigurationTab)
    ? (requested as ConfigurationTab)
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
    ...(context.actor.isSuperAdmin ? (["technique"] as const) : []),
  ];
  const tab = selectedTab(params.tab, availableTabs);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="text-title">Configuration</h1>
          <p className="muted-text">Fournisseurs IA et paramètres techniques réunis ici.</p>
        </div>
      </div>

      <div className="org-tabs channel-tabs" role="tablist" aria-label="Sections de configuration">
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
            aria-selected={tab === "technique"}
            href="/configuration?tab=technique"
          >
            Technique
          </a>
        ) : null}
      </div>

      {tab === "ia" ? (
        <section>
          {!aiKeyReady ? (
            <p className="alert error">
              La clé de chiffrement des fournisseurs IA n’est pas disponible. Un super-admin doit la
              configurer dans <a href="/configuration?tab=technique">Configuration → Technique</a>.
              Le chat legacy continue de fonctionner.
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

      {tab === "technique" && context.actor.isSuperAdmin ? (
        <section>
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
        </section>
      ) : null}
    </section>
  );
}
