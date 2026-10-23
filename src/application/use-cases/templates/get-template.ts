import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatTemplate, ChatTemplateVersion } from "@/domain/entities/chat-template";

export type TemplateDeps = {
  templates: ChatTemplateRepository;
};

export type TemplateDetail = {
  template: ChatTemplate;
  versions: ChatTemplateVersion[];
  currentVersion: number;
  references: { links: boolean; fiches: boolean };
};

/** Consultation d'un modèle + ses versions (US-TEMPLATE-001). */
export async function getTemplate(
  deps: TemplateDeps,
  actor: Actor,
  key: string,
): Promise<TemplateDetail> {
  assertCan(actor, "templates:read");
  const organizationId = organizationOf(actor);

  const template = await deps.templates.findByKey(organizationId, key);
  if (template === null) {
    throw new NotFoundError("Modèle introuvable");
  }
  const current = await deps.templates.currentVersion(organizationId, key);
  const linkKeys = await deps.templates.listKeysReferencedByLinks(organizationId);
  const ficheKeys = await deps.templates.listKeysReferencedByFiches(organizationId);

  // Versions : on remonte depuis la courante (les numéros sont denses dès 1).
  const versions: ChatTemplateVersion[] = [];
  const maxVersion = current?.version ?? 0;
  for (let version = 1; version <= maxVersion; version += 1) {
    const found = await deps.templates.findVersion(organizationId, key, version);
    if (found !== null) versions.push(found);
  }

  return {
    template,
    versions,
    currentVersion: maxVersion,
    references: { links: linkKeys.includes(key), fiches: ficheKeys.includes(key) },
  };
}
