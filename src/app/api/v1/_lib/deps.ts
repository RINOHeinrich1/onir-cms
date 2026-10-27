import {
  webhookExecutionDependencies,
  webhookManagementDependencies,
} from "@/app/api/_lib/webhooks";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatTemplateRepository } from "@/infrastructure/db/chat-template-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgFicheSearchRepository } from "@/infrastructure/db/fiche-search-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgPublicStatisticsRepository } from "@/infrastructure/db/public-statistics-repository";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { pgWebhookDeliveryRepository } from "@/infrastructure/db/webhook-delivery-repository";
import { pgWebhookEndpointRepository } from "@/infrastructure/db/webhook-endpoint-repository";

export function prospectDeps() {
  return { prospects: pgProspectRepository(getPool()) };
}

export function ficheDeps() {
  return { fiches: pgFicheRepository(getPool()) };
}

export function ficheSearchDeps() {
  return { fiches: pgFicheSearchRepository(getPool()) };
}

export function conversationDeps() {
  const pool = getPool();
  return {
    conversations: pgConversationRepository(pool),
    links: pgChatLinkRepository(pool),
    prospects: pgProspectRepository(pool),
    fiches: pgFicheRepository(pool),
  };
}

export function chatbotReadDeps() {
  return { links: pgChatLinkRepository(getPool()) };
}

export function chatbotWriteDeps() {
  const pool = getPool();
  return {
    links: pgChatLinkRepository(pool),
    prospects: pgProspectRepository(pool),
    templates: pgChatTemplateRepository(pool),
    confidentialites: pgConfidentialiteRepository(pool),
    visualTemplates: pgVisualTemplateRepository(pool),
    bindings: pgTemplateDataBindingRepository(pool),
    linkDataBindings: pgLinkDataBindingRepository(pool),
    aiProviders: pgAiProviderRepository(pool),
    aiModels: pgAiProviderModelRepository(pool),
  };
}

export function templateDeps() {
  return { templates: pgChatTemplateRepository(getPool()) };
}

export function statisticsDeps() {
  return { statistics: pgPublicStatisticsRepository(getPool()) };
}

export function webhookReadDeps() {
  const pool = getPool();
  return {
    endpoints: pgWebhookEndpointRepository(pool),
    deliveries: pgWebhookDeliveryRepository(pool),
  };
}

export function webhookManageDeps() {
  return webhookManagementDependencies();
}

export function webhookExecutionDeps() {
  return webhookExecutionDependencies();
}
