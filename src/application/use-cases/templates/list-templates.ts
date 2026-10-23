import { type Actor, assertCan, organizationOf } from "@/application/actor";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatTemplate } from "@/domain/entities/chat-template";

export type TemplateDeps = {
  templates: ChatTemplateRepository;
};

/** Liste des modèles (US-TEMPLATE-001, lecture). */
export async function listTemplates(deps: TemplateDeps, actor: Actor): Promise<ChatTemplate[]> {
  assertCan(actor, "templates:list");
  return deps.templates.list(organizationOf(actor));
}
