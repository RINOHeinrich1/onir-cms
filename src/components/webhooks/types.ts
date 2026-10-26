import type {
  WebhookDeliveryDto,
  WebhookEndpointAdminDto,
} from "@/application/use-cases/webhooks/webhook-dto";

export type { WebhookDeliveryDto, WebhookEndpointAdminDto };

export type WebhookTemplateOption = {
  key: string;
  label: string;
  version: number;
  fields: Array<{ name: string; label: string; type: string }>;
};

export type WebhookFieldOption = {
  key: string;
  source: "field" | "meta" | "prospect" | "attachment";
  field: string;
  label: string;
  kind: "model" | "meta" | "prospect";
  file: boolean;
};
