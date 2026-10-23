import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError, ValidationError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatTemplateVersion } from "@/domain/entities/chat-template";
import { validateTemplateDefinition } from "@/domain/template-schema";

export type TemplateDeps = {
  templates: ChatTemplateRepository;
};

/**
 * Nouvelle version d'un modèle (snapshot N+1 immuable).
 * La clé ne change jamais (les liens/fiches référencent par clé+version).
 */
export async function updateTemplate(
  deps: TemplateDeps,
  actor: Actor,
  key: string,
  input: unknown,
): Promise<ChatTemplateVersion> {
  assertCan(actor, "templates:update");
  const organizationId = organizationOf(actor);

  const existing = await deps.templates.findByKey(organizationId, key);
  if (existing === null) {
    throw new NotFoundError("Modèle introuvable");
  }
  const validated = validateTemplateDefinition(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.join(" ; "));
  }
  if (validated.value.key !== key) {
    throw new ValidationError("La clé d'un modèle ne peut pas changer");
  }

  return deps.templates.addVersion(organizationId, key, validated.value, actor.id);
}
