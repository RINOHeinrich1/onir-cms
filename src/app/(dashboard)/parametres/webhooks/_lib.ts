import "server-only";

import type { Actor } from "@/application/actor";
import {
  getWebhookEndpoint,
  listWebhookChatbotCatalog,
  type WebhookManagementDependencies,
} from "@/application/use-cases/webhooks/manage-webhooks";
import type { WebhookEndpointAdminDto } from "@/application/use-cases/webhooks/webhook-dto";
import type { WebhookChatbotOption } from "@/components/webhooks/types";
import { ensureAppSecretsLoaded, getAppSecret } from "@/infrastructure/config/app-secrets";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgWebhookEndpointRepository } from "@/infrastructure/db/webhook-endpoint-repository";

export function webhookManagement(): WebhookManagementDependencies {
  const pool = getPool();
  return {
    endpoints: pgWebhookEndpointRepository(pool),
    configs: pgChatbotConfigRepository(pool),
    links: pgChatLinkRepository(pool),
  };
}

export async function loadWebhookChatbots(actor: Actor): Promise<WebhookChatbotOption[]> {
  const catalog = await listWebhookChatbotCatalog(webhookManagement(), actor);
  return catalog.map((chatbot) => ({
    chatLinkId: chatbot.chatLinkId,
    label: chatbot.label,
    fiches: chatbot.fiches,
  }));
}

export async function loadWebhookEndpoint(
  actor: Actor,
  id: string,
): Promise<WebhookEndpointAdminDto> {
  return getWebhookEndpoint(webhookManagement(), actor, id);
}

export async function webhookSecretReady(): Promise<boolean> {
  await ensureAppSecretsLoaded();
  try {
    getAppSecret("WEBHOOK_SECRET_KEY");
    return true;
  } catch {
    return false;
  }
}
