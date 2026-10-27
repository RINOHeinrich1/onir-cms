import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { listApiKeys } from "@/application/use-cases/api-keys/list-api-keys";
import { ApiKeysPanel } from "@/components/api-keys/ApiKeysPanel";
import { pgApiKeyRepository } from "@/infrastructure/db/api-key-repository";
import { getPool } from "@/infrastructure/db/pool";
import { getSessionContext } from "@/infrastructure/session/current-user";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clés API",
};

export default async function ApiKeysPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "api_keys:list")) redirect("/dashboard");

  const keys = await listApiKeys({ apiKeys: pgApiKeyRepository(getPool()) }, context.actor);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Développeur</span>
          <h1 className="text-title">Clés API</h1>
          <p className="muted-text">
            Connectez un service externe aux ressources de l’organisation active. Choisissez les
            scopes de chaque clé ; elles sont réservées aux administrateurs et ne doivent jamais
            être utilisées côté navigateur.
          </p>
        </div>
      </div>
      <ApiKeysPanel initialKeys={keys} />
    </section>
  );
}
