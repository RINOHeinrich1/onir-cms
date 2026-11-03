import type {
  WebhookDeliveryDto,
  WebhookEndpointAdminDto,
} from "@/application/use-cases/webhooks/webhook-dto";

export type { WebhookDeliveryDto, WebhookEndpointAdminDto };

export type WebhookChatbotFicheOption = {
  key: string;
  label: string;
  fields: Array<{ name: string; label: string; type: string }>;
};

export type WebhookChatbotOption = {
  chatLinkId: string;
  label: string;
  fiches: WebhookChatbotFicheOption[];
};

export type WebhookFieldOption = {
  key: string;
  source: "field" | "meta" | "prospect" | "attachment";
  field: string;
  label: string;
  kind: "model" | "meta" | "prospect";
  file: boolean;
};
