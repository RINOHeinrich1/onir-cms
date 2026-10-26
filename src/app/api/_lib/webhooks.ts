import type { WebhookManagementDependencies } from "@/application/use-cases/webhooks/manage-webhooks";
import type { WebhookExecutionDependencies } from "@/application/use-cases/webhooks/trigger-webhook";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgWebhookDeliveryRepository } from "@/infrastructure/db/webhook-delivery-repository";
import { pgWebhookEndpointRepository } from "@/infrastructure/db/webhook-endpoint-repository";
import { attachmentStorage } from "@/infrastructure/storage/attachments";
import { httpWebhookSender } from "@/infrastructure/webhooks/http-sender";

export function webhookManagementDependencies(): WebhookManagementDependencies {
  const pool = getPool();
  return {
    endpoints: pgWebhookEndpointRepository(pool),
    templates: pgChatTemplateRepository(pool),
  };
}

export function webhookExecutionDependencies(): WebhookExecutionDependencies {
  const pool = getPool();
  return {
    endpoints: pgWebhookEndpointRepository(pool),
    deliveries: pgWebhookDeliveryRepository(pool),
    templates: pgChatTemplateRepository(pool),
    fiches: pgFicheRepository(pool),
    prospects: pgProspectRepository(pool),
    attachments: pgAttachmentRepository(pool),
    storage: attachmentStorage(),
    sender: httpWebhookSender(),
  };
}
