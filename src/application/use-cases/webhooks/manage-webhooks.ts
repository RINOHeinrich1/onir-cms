import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { WebhookEndpointRepository } from "@/application/ports/webhook-endpoint-repository";
import {
  assertMappingsForDefinition,
  parseWebhookConfig,
} from "@/application/use-cases/webhooks/parse-webhook-config";
import {
  toWebhookEndpointAdminDto,
  type WebhookEndpointAdminDto,
} from "@/application/use-cases/webhooks/webhook-dto";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import type { WebhookEndpoint } from "@/domain/entities/webhook";

export type WebhookManagementDependencies = {
  endpoints: WebhookEndpointRepository;
  templates: ChatTemplateRepository;
};

export type WebhookTemplateCatalog = {
  key: string;
  label: string;
  version: number;
  fields: Array<{ name: string; label: string; type: string }>;
};

async function definitionForTemplate(
  deps: WebhookManagementDependencies,
  organizationId: string,
  key: string,
): Promise<{ definition: TemplateDefinition; version: number }> {
  const template = await deps.templates.findByKey(organizationId, key);
  if (template === null) throw new ValidationError(`Modèle inconnu : ${key}`);
  const current = await deps.templates.currentVersion(organizationId, key);
  if (current === null) throw new ValidationError(`Modèle sans version : ${key}`);
  return { definition: current.definition, version: current.version };
}

function fieldCatalog(fields: readonly TemplateField[]): WebhookTemplateCatalog["fields"] {
  return fields.map((field) => ({
    name: field.name,
    label: field.label,
    type: field.type,
  }));
}

/** Liste les endpoints (admin uniquement). */
export async function listWebhookEndpoints(
  deps: WebhookManagementDependencies,
  actor: Actor,
  templateKey: string | null = null,
): Promise<WebhookEndpointAdminDto[]> {
  assertCan(actor, "webhooks:update");
  const organizationId = organizationOf(actor);
  const endpoints = await deps.endpoints.list(organizationId, templateKey);
  return endpoints.filter((endpoint) => endpoint.deletedAt === null).map(toWebhookEndpointAdminDto);
}

/** Détail d'un endpoint pour l'édition (admin uniquement). */
export async function getWebhookEndpoint(
  deps: WebhookManagementDependencies,
  actor: Actor,
  id: string,
): Promise<WebhookEndpointAdminDto> {
  assertCan(actor, "webhooks:update");
  const endpoint = await deps.endpoints.findById(organizationOf(actor), id);
  if (endpoint === null || endpoint.deletedAt !== null) {
    throw new NotFoundError("Webhook introuvable");
  }
  return toWebhookEndpointAdminDto(endpoint);
}

/** Catalogue des modèles et de leurs champs courants (admin). */
export async function listWebhookTemplateCatalog(
  deps: WebhookManagementDependencies,
  actor: Actor,
): Promise<WebhookTemplateCatalog[]> {
  assertCan(actor, "webhooks:update");
  const organizationId = organizationOf(actor);
  const templates = await deps.templates.list(organizationId);
  const catalog: WebhookTemplateCatalog[] = [];
  for (const template of templates) {
    const current = await deps.templates.currentVersion(organizationId, template.key);
    if (current === null) continue;
    catalog.push({
      key: template.key,
      label: template.label,
      version: current.version,
      fields: fieldCatalog(current.definition.fields),
    });
  }
  return catalog;
}

export async function createWebhookEndpoint(
  deps: WebhookManagementDependencies,
  actor: Actor,
  input: unknown,
): Promise<WebhookEndpointAdminDto> {
  assertCan(actor, "webhooks:create");
  const organizationId = organizationOf(actor);
  const config = parseWebhookConfig(input);
  const { definition } = await definitionForTemplate(deps, organizationId, config.templateKey);
  assertMappingsForDefinition(config.fieldMappings, definition);
  const endpoint = await deps.endpoints.create(organizationId, {
    ...config,
    createdBy: actor.id,
  });
  return toWebhookEndpointAdminDto(endpoint);
}

export async function updateWebhookEndpoint(
  deps: WebhookManagementDependencies,
  actor: Actor,
  id: string,
  input: unknown,
): Promise<WebhookEndpointAdminDto> {
  assertCan(actor, "webhooks:update");
  const organizationId = organizationOf(actor);
  const existing = await deps.endpoints.findById(organizationId, id);
  if (existing === null || existing.deletedAt !== null) {
    throw new NotFoundError("Webhook introuvable");
  }
  const config = parseWebhookConfig(input, existing);
  const { definition } = await definitionForTemplate(deps, organizationId, config.templateKey);
  assertMappingsForDefinition(config.fieldMappings, definition);
  const updated = await deps.endpoints.update(organizationId, id, {
    ...config,
    createdBy: existing.createdBy,
  });
  if (updated === null) throw new NotFoundError("Webhook introuvable");
  return toWebhookEndpointAdminDto(updated);
}

export async function deleteWebhookEndpoint(
  deps: WebhookManagementDependencies,
  actor: Actor,
  id: string,
): Promise<void> {
  assertCan(actor, "webhooks:delete");
  const deleted = await deps.endpoints.softDelete(organizationOf(actor), id);
  if (!deleted) throw new NotFoundError("Webhook introuvable");
}

export async function loadWebhookEndpoint(
  deps: WebhookManagementDependencies,
  organizationId: string,
  id: string,
): Promise<WebhookEndpoint> {
  const endpoint = await deps.endpoints.findById(organizationId, id);
  if (endpoint === null) throw new NotFoundError("Webhook introuvable");
  return endpoint;
}
