import type { ConversationSummary } from "@/application/ports/conversation-repository";
import { buildWidgetSnippet, widgetEmbedUrl } from "@/application/use-cases/links/widget-code";
import {
  toWebhookDeliveryDto,
  toWebhookEndpointAdminDto,
} from "@/application/use-cases/webhooks/webhook-dto";
import {
  type ChatLink,
  type ChatMessage,
  type Conversation,
  channelsForLink,
} from "@/domain/entities/chat";
import type { ChatTemplate, ChatTemplateVersion } from "@/domain/entities/chat-template";
import type { Fiche } from "@/domain/entities/fiche";
import type { Prospect } from "@/domain/entities/prospect";
import type { WebhookDelivery, WebhookEndpoint } from "@/domain/entities/webhook";

export type FicheDto = ReturnType<typeof ficheDto>;
export type ProspectDto = ReturnType<typeof prospectDto>;
export type ConversationSummaryDto = ReturnType<typeof conversationSummaryDto>;
export type ConversationDto = ReturnType<typeof conversationDto>;
export type MessageDto = ReturnType<typeof messageDto>;
export type ChatbotDto = ReturnType<typeof chatbotDto>;
export type TemplateDto = ReturnType<typeof templateDto>;
export type TemplateVersionDto = ReturnType<typeof templateVersionDto>;

export function ficheDto(fiche: Fiche) {
  return {
    id: fiche.id,
    createdAt: fiche.createdAt,
    template: { key: fiche.templateKey, version: fiche.templateVersion },
    prospectId: fiche.prospectId,
    conversationId: fiche.conversationId,
    archived: fiche.archivee,
    data: fiche.data,
  };
}

export function prospectDto(prospect: Prospect) {
  return {
    id: prospect.id,
    nom: prospect.nom,
    prenom: prospect.prenom,
    nature: prospect.nature,
    email: prospect.email,
    activite: prospect.activite,
    fonction: prospect.fonction,
    detail: prospect.detail,
    origine: prospect.origine,
    chatbotId: prospect.lienId,
    chatbotLabel: prospect.lienLabel,
    contactMissing: prospect.contactMissing,
    createdAt: prospect.createdAt,
    updatedAt: prospect.updatedAt,
  };
}

export function conversationSummaryDto(conversation: ConversationSummary) {
  return {
    id: conversation.id,
    chatbotId: conversation.linkId,
    chatbotLabel: conversation.linkLabel,
    chatbotType: conversation.linkType,
    prospectId: conversation.prospectId,
    visitor: {
      nom: conversation.visitorNom,
      email: conversation.visitorEmail,
    },
    status: conversation.statut,
    messageCount: conversation.messageCount,
    lastMessageAt: conversation.lastMessageAt,
    archived: conversation.archivee,
    createdAt: conversation.createdAt,
  };
}

export function conversationDto(conversation: Conversation) {
  return {
    id: conversation.id,
    chatbotId: conversation.linkId,
    prospectId: conversation.prospectId,
    visitor: {
      nom: conversation.visitorNom,
      email: conversation.visitorEmail,
      contacts: conversation.visitorContacts,
    },
    status: conversation.statut,
    lastMessageAt: conversation.lastMessageAt,
    consentementAt: conversation.consentementAt,
    confidentialiteId: conversation.confidentialiteId,
    channel: conversation.channel ?? "page",
    createdAt: conversation.createdAt,
  };
}

export function messageDto(message: ChatMessage) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    medias: message.medias,
    attachments: message.attachments,
    createdAt: message.createdAt,
  };
}

export function chatbotDto(link: ChatLink & { url: string | null }) {
  const channels = channelsForLink(link);
  const widgetEnabled = channels.widget.enabled;
  const token = link.url?.split("/").filter(Boolean).at(-1) ?? "";
  return {
    id: link.id,
    label: link.label,
    type: link.type,
    active: link.actif,
    expiresAt: link.expiresAt,
    prospectId: link.prospectId,
    template: { key: link.templateKey, version: link.templateVersion },
    sources: link.sources,
    channels: {
      page: {
        enabled: channels.page.enabled,
        identificationMode: channels.page.identificationMode,
        publicUrl: channels.page.enabled ? link.url : null,
      },
      widget: {
        enabled: channels.widget.enabled,
        identificationMode: channels.widget.identificationMode,
        position: channels.widget.widgetConfig.position ?? null,
        embedUrl: widgetEnabled && token !== "" ? widgetEmbedUrl(token) : null,
        snippet:
          widgetEnabled && token !== ""
            ? buildWidgetSnippet(token, channels.widget.widgetConfig.position ?? "bottom-right")
            : null,
      },
    },
    ai: { providerId: link.aiProviderId, model: link.aiModel },
    visitCount: link.visitCount,
    lastVisitAt: link.lastVisitAt,
    createdAt: link.createdAt,
  };
}

export function templateDto(template: ChatTemplate, current: ChatTemplateVersion | null) {
  return {
    key: template.key,
    label: template.label,
    description: template.description,
    currentVersion: current?.version ?? 0,
    fields:
      current?.definition.fields.map((field) => ({
        name: field.name,
        label: field.label,
        type: field.type,
        required: field.required,
      })) ?? [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

export function templateVersionDto(version: ChatTemplateVersion) {
  return {
    version: version.version,
    createdAt: version.createdAt,
    createdBy: version.createdBy,
    definition: version.definition,
  };
}

export function webhookEndpointDto(endpoint: WebhookEndpoint) {
  return toWebhookEndpointAdminDto(endpoint);
}

export function webhookDeliveryDto(delivery: WebhookDelivery) {
  return toWebhookDeliveryDto(delivery);
}
