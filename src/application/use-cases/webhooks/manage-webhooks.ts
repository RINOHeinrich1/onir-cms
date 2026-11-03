import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type {
  WebhookEndpointRepository,
  WebhookEndpointScopeFilter,
} from "@/application/ports/webhook-endpoint-repository";
import { findFiche, primaryFiche } from "@/application/use-cases/chat/chatbot-config-runtime";
import {
  assertMappingsForDefinition,
  parseWebhookConfig,
} from "@/application/use-cases/webhooks/parse-webhook-config";
import {
  toWebhookEndpointAdminDto,
  type WebhookEndpointAdminDto,
} from "@/application/use-cases/webhooks/webhook-dto";
import type { TemplateDefinition, TemplateField } from "@/domain/entities/chat-template";
import type { ChatbotConfig, FicheDefinition } from "@/domain/entities/chatbot-config";
import type { WebhookEndpoint } from "@/domain/entities/webhook";

export type WebhookManagementDependencies = {
  endpoints: WebhookEndpointRepository;
  configs: ChatbotConfigRepository;
  links: ChatLinkRepository;
};

export type WebhookChatbotFicheCatalog = {
  key: string;
  label: string;
  fields: Array<{ name: string; label: string; type: string }>;
};

export type WebhookChatbotCatalog = {
  chatLinkId: string;
  label: string;
  fiches: WebhookChatbotFicheCatalog[];
};

/** Transforme une fiche de collecte en définition exploitable par le moteur. */
function ficheAsDefinition(fiche: FicheDefinition): TemplateDefinition {
  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    systemPrompt: "",
    fields: fiche.fields,
    renderTemplate: fiche.renderTemplate,
  };
}

/** Résout la définition depuis la fiche de collecte du chatbot. */
async function definitionForScope(
  deps: WebhookManagementDependencies,
  organizationId: string,
  scope: { chatLinkId: string | null; ficheKey: string | null },
): Promise<{ definition: TemplateDefinition; version: number | null }> {
  if (scope.chatLinkId === null) {
    throw new ValidationError("Périmètre du webhook invalide");
  }
  const config: ChatbotConfig | null = await deps.configs.currentForLink(
    organizationId,
    scope.chatLinkId,
  );
  if (config === null) {
    throw new ValidationError("Ce chatbot n'a pas de configuration de collecte");
  }
  const fiche = scope.ficheKey === null ? primaryFiche(config) : findFiche(config, scope.ficheKey);
  if (fiche === null) {
    throw new ValidationError(`Fiche de collecte inconnue : ${scope.ficheKey ?? ""}`);
  }
  return { definition: ficheAsDefinition(fiche), version: null };
}

function fieldCatalog(fields: readonly TemplateField[]): WebhookChatbotFicheCatalog["fields"] {
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
  filter: WebhookEndpointScopeFilter = {},
): Promise<WebhookEndpointAdminDto[]> {
  assertCan(actor, "webhooks:update");
  const organizationId = organizationOf(actor);
  const endpoints = await deps.endpoints.list(organizationId, filter);
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

/** Catalogue des chatbots et de leurs fiches de collecte courantes (admin). */
export async function listWebhookChatbotCatalog(
  deps: WebhookManagementDependencies,
  actor: Actor,
): Promise<WebhookChatbotCatalog[]> {
  assertCan(actor, "webhooks:update");
  const organizationId = organizationOf(actor);
  const links = await deps.links.list(organizationId);
  const catalog: WebhookChatbotCatalog[] = [];
  for (const link of links) {
    const config = await deps.configs.currentForLink(organizationId, link.id);
    if (config === null || config.fiches.length === 0) continue;
    catalog.push({
      chatLinkId: link.id,
      label: link.label.trim() === "" ? link.id : link.label,
      fiches: config.fiches.map((fiche) => ({
        key: fiche.key,
        label: fiche.label.trim() === "" ? fiche.key : fiche.label,
        fields: fieldCatalog(fiche.fields),
      })),
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
  return createWebhookEndpointForOrganization(deps, organizationOf(actor), actor.id, input);
}

export async function createWebhookEndpointForOrganization(
  deps: WebhookManagementDependencies,
  organizationId: string,
  createdBy: string | null,
  input: unknown,
): Promise<WebhookEndpointAdminDto> {
  const config = parseWebhookConfig(input);
  const { definition } = await definitionForScope(deps, organizationId, config);
  assertMappingsForDefinition(config.fieldMappings, definition);
  const endpoint = await deps.endpoints.create(organizationId, {
    ...config,
    createdBy,
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
  return updateWebhookEndpointForOrganization(deps, organizationOf(actor), id, input);
}

export async function updateWebhookEndpointForOrganization(
  deps: WebhookManagementDependencies,
  organizationId: string,
  id: string,
  input: unknown,
): Promise<WebhookEndpointAdminDto> {
  const existing = await deps.endpoints.findById(organizationId, id);
  if (existing === null || existing.deletedAt !== null) {
    throw new NotFoundError("Webhook introuvable");
  }
  const config = parseWebhookConfig(input, existing);
  const { definition } = await definitionForScope(deps, organizationId, config);
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
  return deleteWebhookEndpointForOrganization(deps, organizationOf(actor), id);
}

export async function deleteWebhookEndpointForOrganization(
  deps: WebhookManagementDependencies,
  organizationId: string,
  id: string,
): Promise<void> {
  const deleted = await deps.endpoints.softDelete(organizationId, id);
  if (!deleted) throw new NotFoundError("Webhook introuvable");
}

export async function loadWebhookEndpoint(
  deps: Pick<WebhookManagementDependencies, "endpoints">,
  organizationId: string,
  id: string,
): Promise<WebhookEndpoint> {
  const endpoint = await deps.endpoints.findById(organizationId, id);
  if (endpoint === null) throw new NotFoundError("Webhook introuvable");
  return endpoint;
}
