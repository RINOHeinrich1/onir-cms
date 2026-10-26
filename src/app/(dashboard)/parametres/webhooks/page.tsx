import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { actorCan } from "@/application/actor";
import {
  listWebhookEndpoints,
  listWebhookTemplateCatalog,
} from "@/application/use-cases/webhooks/manage-webhooks";
import { listWebhookDeliveries } from "@/application/use-cases/webhooks/trigger-webhook";
import { WebhooksPanel } from "@/components/webhooks/WebhooksPanel";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgWebhookDeliveryRepository } from "@/infrastructure/db/webhook-delivery-repository";
import { pgWebhookEndpointRepository } from "@/infrastructure/db/webhook-endpoint-repository";
import { getSessionContext } from "@/infrastructure/session/current-user";
import { attachmentStorage } from "@/infrastructure/storage/attachments";
import { httpWebhookSender } from "@/infrastructure/webhooks/http-sender";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Webhooks",
};

/** Paramètres > Webhooks — configuration admin des envois sortants (ADR-0035). */
export default async function WebhooksPage() {
  const context = await getSessionContext();
  if (context === null) redirect("/login");
  if (!actorCan(context.actor, "webhooks:create")) redirect("/dashboard");

  const pool = getPool();
  const management = {
    endpoints: pgWebhookEndpointRepository(pool),
    templates: pgChatTemplateRepository(pool),
  };
  const [endpoints, templates, deliveries] = await Promise.all([
    listWebhookEndpoints(management, context.actor),
    listWebhookTemplateCatalog(management, context.actor),
    listWebhookDeliveries(
      {
        endpoints: management.endpoints,
        deliveries: pgWebhookDeliveryRepository(pool),
        templates: management.templates,
        fiches: pgFicheRepository(pool),
        prospects: pgProspectRepository(pool),
        attachments: pgAttachmentRepository(pool),
        storage: attachmentStorage(),
        sender: httpWebhookSender(),
      },
      context.actor,
      { limit: 50 },
    ),
  ]);

  return (
    <section>
      <div className="page-head">
        <div>
          <span className="eyebrow">Paramètres</span>
          <h1 className="text-title">Webhooks</h1>
          <p className="muted-text">
            Envoyez les champs d’une fiche vers un service HTTP externe, depuis une action sur la
            fiche. Les endpoints sont rattachés à un modèle de raisonnement.
          </p>
        </div>
      </div>

      {env("WEBHOOK_SECRET_KEY") === undefined ? (
        <p className="alert error">
          WEBHOOK_SECRET_KEY n’est pas configurée : les webhooks authentifiés et les en-têtes
          secrets sont indisponibles.
        </p>
      ) : null}

      <WebhooksPanel
        initialEndpoints={endpoints}
        initialDeliveries={deliveries}
        templates={templates.map((template) => ({
          key: template.key,
          label: template.label,
          version: template.version,
          fields: template.fields,
        }))}
      />
    </section>
  );
}
