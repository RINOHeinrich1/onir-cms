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
  templateKey: string;
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

export interface WebhookEndpointRepository {
  /** Endpoints non supprimés, éventuellement filtrés par modèle. */
  list(organizationId: string, templateKey?: string | null): Promise<WebhookEndpoint[]>;
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
  /** Clés de modèles encore référencées par un endpoint non supprimé. */
  listTemplateKeysReferenced(organizationId: string): Promise<string[]>;
}
