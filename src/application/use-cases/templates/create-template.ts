import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { ConflictError, ValidationError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatTemplateVersion } from "@/domain/entities/chat-template";
import { validateTemplateDefinition } from "@/domain/template-schema";

export type TemplateDeps = {
  templates: ChatTemplateRepository;
};

/** Création d'un modèle + sa version 1 (US-TEMPLATE-001, marketeur/admin). */
export async function createTemplate(
  deps: TemplateDeps,
  actor: Actor,
  input: unknown,
): Promise<ChatTemplateVersion> {
  assertCan(actor, "templates:create");
  const organizationId = organizationOf(actor);

  const validated = validateTemplateDefinition(input);
  if (!validated.ok) {
    throw new ValidationError(validated.errors.join(" ; "));
  }
  const existing = await deps.templates.findByKey(organizationId, validated.value.key);
  if (existing !== null) {
    throw new ConflictError(`Clé déjà utilisée : ${validated.value.key}`);
  }

  return deps.templates.createTemplate(organizationId, validated.value, actor.id);
}
