import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { WebhookEndpointAdminDto } from "@/application/use-cases/webhooks/webhook-dto";
import { WebhookWizard } from "@/components/webhooks/WebhookWizard";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { loadWebhookChatbots, loadWebhookEndpoint, webhookSecretReady } from "../../_lib";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Modifier le webhook",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function EditWebhookPage({ params }: PageProps) {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "webhooks:update")) redirect("/parametres/webhooks");

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let endpoint: WebhookEndpointAdminDto;
  try {
    endpoint = await loadWebhookEndpoint(context.actor, id);
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

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
      <WebhookWizard endpoint={endpoint} chatbots={chatbots} />
    </section>
  );
}
