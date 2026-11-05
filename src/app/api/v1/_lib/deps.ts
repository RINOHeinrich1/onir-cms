import {
  webhookExecutionDependencies,
  webhookManagementDependencies,
} from "@/app/api/_lib/webhooks";
import { pgAiClientFactory } from "@/infrastructure/ai/ai-client-factory";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAttachmentRepository } from "@/infrastructure/db/attachment-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatSearchSessionRepository } from "@/infrastructure/db/chat-search-session-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { pgConfidentialiteRepository } from "@/infrastructure/db/confidentialite-repository";
import { pgConnaissanceRepository } from "@/infrastructure/db/connaissance-repository";
import { pgConversationFicheInstanceRepository } from "@/infrastructure/db/conversation-fiche-instance-repository";
import { pgConversationRepository } from "@/infrastructure/db/conversation-repository";
import { pgFicheRepository } from "@/infrastructure/db/fiche-repository";
import { pgFicheSearchRepository } from "@/infrastructure/db/fiche-search-repository";
import { pgFicheToolRepository } from "@/infrastructure/db/fiche-tool-repository";
import { pgLinkDataBindingRepository } from "@/infrastructure/db/link-data-binding-repository";
import { pgMediaRepository } from "@/infrastructure/db/media-repository";
import { pgOrganizationRepository } from "@/infrastructure/db/organization-repository";
import { getPool } from "@/infrastructure/db/pool";
import { pgProspectRepository } from "@/infrastructure/db/prospect-repository";
import { pgPublicStatisticsRepository } from "@/infrastructure/db/public-statistics-repository";
import { pgTemplateDataBindingRepository } from "@/infrastructure/db/template-data-binding-repository";
import { pgVisualTemplateRepository } from "@/infrastructure/db/visual-template-repository";
import { pgWebhookDeliveryRepository } from "@/infrastructure/db/webhook-delivery-repository";
import { pgWebhookEndpointRepository } from "@/infrastructure/db/webhook-endpoint-repository";
import { mediaStorage } from "@/infrastructure/storage";

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

export function conversationChatDeps() {
  const pool = getPool();
  const ficheTools = pgFicheToolRepository(pool);
  return {
    organizations: pgOrganizationRepository(pool),
    links: pgChatLinkRepository(pool),
    conversations: pgConversationRepository(pool),
    prospects: pgProspectRepository(pool),
    connaissances: pgConnaissanceRepository(pool),
    medias: pgMediaRepository(pool),
    attachments: pgAttachmentRepository(pool),
    ai: pgAiClientFactory(pool),
    configs: pgChatbotConfigRepository(pool),
    ficheInstances: pgConversationFicheInstanceRepository(pool),
    fiches: pgFicheRepository(pool),
    ficheTools,
    searchSessions: pgChatSearchSessionRepository(pool),
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
    confidentialites: pgConfidentialiteRepository(pool),
    visualTemplates: pgVisualTemplateRepository(pool),
    bindings: pgTemplateDataBindingRepository(pool),
    linkDataBindings: pgLinkDataBindingRepository(pool),
    aiProviders: pgAiProviderRepository(pool),
    aiModels: pgAiProviderModelRepository(pool),
  };
}

export function connaissanceDeps() {
  return { connaissances: pgConnaissanceRepository(getPool()) };
}

export function mediaReadDeps() {
  return { medias: pgMediaRepository(getPool()) };
}

export function mediaWriteDeps() {
  const pool = getPool();
  return {
    medias: pgMediaRepository(pool),
    storage: mediaStorage(),
  };
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
