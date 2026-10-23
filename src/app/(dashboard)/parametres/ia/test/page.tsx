import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listAiProviders } from "@/application/use-cases/ai/manage-ai-providers";
import { AiTestConsole } from "@/components/ai/AiTestConsole";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Test IA",
};

type PageProps = {
  searchParams: Promise<{ provider?: string; model?: string }>;
};

/** Page de test d'un modèle : chat éphémère avec rendu Markdown (ADR-0032). */
export default async function AiTestPage({ searchParams }: PageProps) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "ai:manage")) redirect("/parametres/ia");

  const providers = await listAiProviders(
    { providers: pgAiProviderRepository(getPool()) },
    context.actor,
  );
  const params = await searchParams;
  const providerId =
    params.provider !== undefined && providers.some((provider) => provider.id === params.provider)
      ? params.provider
      : (providers[0]?.id ?? null);

  return (
    <section className="ai-test-page">
      {providers.length === 0 ? (
        <div className="card">
          <h1 className="ai-test-title">Test IA</h1>
          <p className="alert error">
            Aucun fournisseur actif. Ajoutez un fournisseur et un modèle depuis{" "}
            <a href="/parametres/ia">Paramètres IA</a>.
          </p>
          <a className="btn ghost small" href="/parametres/ia">
            ← Retour aux fournisseurs
          </a>
        </div>
      ) : (
        <AiTestConsole
          providers={providers.map((provider) => ({
            id: provider.id,
            label: provider.label,
            preset: provider.preset,
            defaultModel: provider.defaultModel,
          }))}
          initialProviderId={providerId}
          initialModelRowId={params.model ?? null}
        />
      )}
    </section>
  );
}
