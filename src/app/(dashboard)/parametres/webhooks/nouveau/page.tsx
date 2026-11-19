import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { WebhookWizard } from "@/components/webhooks/WebhookWizard";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { loadWebhookChatbots, webhookSecretReady } from "../_lib";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Créer un webhook",
};

export default async function NewWebhookPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "webhooks:create")) redirect("/parametres/webhooks");

  const [chatbots, secretReady] = await Promise.all([
    loadWebhookChatbots(context.actor),
    webhookSecretReady(),
  ]);

  return (
    <section>
      {!secretReady ? (
        <p className="alert error">
          La clé de chiffrement des webhooks n’est pas disponible. Un super-admin doit la configurer
          dans <a href="/configuration">Configuration → Secrets applicatifs</a>.
        </p>
      ) : null}
      <WebhookWizard endpoint={null} chatbots={chatbots} />
    </section>
  );
}
