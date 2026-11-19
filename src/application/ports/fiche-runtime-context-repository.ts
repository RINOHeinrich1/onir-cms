export type WebhookRuntimeResult = {
  deliveryId: string;
  endpointId: string;
  endpointName: string;
  eventType: string | null;
  status: "succeeded" | "failed";
  responseStatus: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type FicheRuntimeIncident = {
  id: string;
  kind: string;
  title: string;
  severity: string;
  lastSeenAt: string;
  occurrences: number;
};

export interface FicheRuntimeContextRepository {
  listWebhookResults(
    organizationId: string,
    conversationId: string,
    limit: number,
  ): Promise<WebhookRuntimeResult[]>;
  listIncidents(
    organizationId: string,
    conversationId: string,
    limit: number,
  ): Promise<FicheRuntimeIncident[]>;
}
