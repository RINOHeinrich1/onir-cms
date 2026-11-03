import type {
  WebhookAuth,
  WebhookBodyMode,
  WebhookEndpoint,
  WebhookFieldMapping,
  WebhookHeader,
  WebhookHttpMethod,
  WebhookQueryParam,
} from "@/domain/entities/webhook";

export type WebhookEndpointWriteInput = {
  /** Scope fiche de collecte : chatbot source. */
  chatLinkId: string | null;
  /** Fiche de collecte ciblée ; null = toutes les fiches du chatbot. */
  ficheKey: string | null;
  name: string;
  description: string;
  enabled: boolean;
  httpMethod: WebhookHttpMethod;
  url: string;
  queryParams: WebhookQueryParam[];
  headers: WebhookHeader[];
  bodyMode: WebhookBodyMode;
  bodyTemplate: string;
  fieldMappings: WebhookFieldMapping[];
  auth: WebhookAuth;
  timeoutMs: number;
  maxAttempts: number;
  retryBackoffMs: number;
  followRedirects: boolean;
  tlsVerify: boolean;
  allowInsecureHttp: boolean;
  allowPrivateNetwork: boolean;
  createdBy: string | null;
};

export type WebhookEndpointScopeFilter = {
  chatLinkId?: string | null;
};

export interface WebhookEndpointRepository {
  /** Endpoints non supprimés, éventuellement filtrés par scope. */
  list(organizationId: string, filter?: WebhookEndpointScopeFilter): Promise<WebhookEndpoint[]>;
  /** Trouve un endpoint, y compris supprimé logiquement (pour les livraisons en cours). */
  findById(organizationId: string, id: string): Promise<WebhookEndpoint | null>;
  create(organizationId: string, input: WebhookEndpointWriteInput): Promise<WebhookEndpoint>;
  update(
    organizationId: string,
    id: string,
    input: WebhookEndpointWriteInput,
  ): Promise<WebhookEndpoint | null>;
  /** Suppression logique ; false si introuvable. */
  softDelete(organizationId: string, id: string): Promise<boolean>;
}
