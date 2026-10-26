import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, NotFoundError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { WebhookEndpointRepository } from "@/application/ports/webhook-endpoint-repository";

export type TemplateDeps = {
  templates: ChatTemplateRepository;
  webhooks?: WebhookEndpointRepository;
};

/**
 * Suppression d'un modèle (admin/marketeur).
 * Refusée si la clé est référencée par un lien ou une fiche (traçabilité).
 */
export async function deleteTemplate(deps: TemplateDeps, actor: Actor, key: string): Promise<void> {
  assertCan(actor, "templates:delete");
  const organizationId = organizationOf(actor);

  const existing = await deps.templates.findByKey(organizationId, key);
  if (existing === null) {
    throw new NotFoundError("Modèle introuvable");
  }
  const linkKeys = await deps.templates.listKeysReferencedByLinks(organizationId);
  const ficheKeys = await deps.templates.listKeysReferencedByFiches(organizationId);
  const webhookKeys =
    deps.webhooks === undefined
      ? []
      : await deps.webhooks.listTemplateKeysReferenced(organizationId);
  if (linkKeys.includes(key) || ficheKeys.includes(key) || webhookKeys.includes(key)) {
    throw new ConflictError("Modèle utilisé par un lien, une fiche ou un webhook");
  }

  const deleted = await deps.templates.deleteTemplate(organizationId, key);
  if (!deleted) {
    throw new NotFoundError("Modèle introuvable");
  }
}
