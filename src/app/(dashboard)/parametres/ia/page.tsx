import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { getOrganizationAiSettings } from "@/application/use-cases/ai/manage-ai-settings";
import { AiProvidersPanel } from "@/components/ai/AiProvidersPanel";
import { ensureAppSecretsLoaded, getAppSecret } from "@/infrastructure/config/app-secrets";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { legacyAiCredentials } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Fournisseurs IA",
};

/** Paramètres IA de l'organisation active (ADR-0029 §8). */
export default async function AiSettingsPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "ai:list")) redirect("/dashboard");

  const pool = getPool();
  const repository = pgAiProviderRepository(pool);
  const modelRepository = pgAiProviderModelRepository(pool);
  const [providers, settings] = await Promise.all([
    listAiProviders({ providers: repository }, context.actor, { includeArchived: true }),
    getOrganizationAiSettings({ providers: repository, models: modelRepository }, context.actor),
  ]);

  await ensureAppSecretsLoaded();
  let aiKeyReady = true;
  try {
    getAppSecret("AI_PROVIDER_KEY");
  } catch {
    aiKeyReady = false;
  }

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Paramètres</span>
          <h1 className="text-title">Fournisseurs IA</h1>
          <p className="muted-text">
            Connectez des fournisseurs OpenAI-compatible, testez leurs modèles et choisissez le
            défaut de l&apos;organisation.
          </p>
        </div>
        <a className="btn ghost small" href="/parametres/ia/test">
          Page de test
        </a>
      </div>

      {!aiKeyReady ? (
        <p className="alert error">
          La clé de chiffrement des fournisseurs IA n&apos;est pas disponible. Un super-admin doit
          la configurer dans <a href="/configuration">Configuration → Secrets applicatifs</a>. Le
          chat legacy continue de fonctionner.
        </p>
      ) : null}

      <AiProvidersPanel
        initialProviders={providers}
        initialSettings={settings}
        canManage={actorCan(context.actor, "ai:manage")}
        legacyAvailable={legacyAiCredentials() !== null}
      />
    </section>
  );
}
