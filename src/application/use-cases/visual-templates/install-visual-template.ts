import { type Actor, assertCan, assertSuperAdmin, organizationOf } from "@/application/actor";
import { NotFoundError, TemplateInUseError } from "@/application/errors";
import type { VisualTemplateAuditRepository } from "@/application/ports/visual-template-audit-repository";
import type {
  VisualTemplate,
  VisualTemplateInstallation,
  VisualTemplateRepository,
} from "@/application/ports/visual-template-repository";

export type VisualTemplateInstallationDependencies = {
  templates: VisualTemplateRepository;
  audit?: VisualTemplateAuditRepository;
};

export async function installVisualTemplateForOrganization(
  deps: VisualTemplateInstallationDependencies,
  actor: Actor,
  templateId: string,
): Promise<VisualTemplateInstallation> {
  assertCan(actor, "visualtemplates:install");
  const organizationId = organizationOf(actor);
  const template = await deps.templates.findByIdForOrganization(organizationId, templateId);
  if (template === null) throw new NotFoundError("Template visuel introuvable");

  const installation = await deps.templates.install(
    organizationId,
    template.id,
    actor.id,
    "organization_admin",
  );
  await deps.audit?.record({
    organizationId,
    templateId: template.id,
    actorId: actor.id,
    event: "install",
  });
  return installation;
}

async function uninstallForOrganization(
  deps: VisualTemplateInstallationDependencies,
  actor: Actor,
  organizationId: string,
  templateId: string,
  event: "uninstall" | "platform_uninstall",
): Promise<void> {
  const template = await deps.templates.findByIdForOrganization(organizationId, templateId, true);
  if (template === null) throw new NotFoundError("Template visuel introuvable");

  const usages = await deps.templates.countLinkUsages(organizationId, template.id);
  if (usages > 0) throw new TemplateInUseError(template.name, usages);

  const removed = await deps.templates.uninstall(organizationId, template.id);
  if (!removed) throw new NotFoundError("Template non installé dans cette organisation");

  await deps.audit?.record({
    organizationId,
    templateId: template.id,
    actorId: actor.id,
    event,
  });
}

export async function uninstallVisualTemplateForOrganization(
  deps: VisualTemplateInstallationDependencies,
  actor: Actor,
  templateId: string,
): Promise<void> {
  assertCan(actor, "visualtemplates:uninstall");
  await uninstallForOrganization(deps, actor, organizationOf(actor), templateId, "uninstall");
}

export async function setPlatformVisualTemplateInstallation(
  deps: VisualTemplateInstallationDependencies,
  actor: Actor,
  organizationId: string,
  templateId: string,
  installed: boolean,
): Promise<void> {
  assertSuperAdmin(actor);
  const template = await deps.templates.findById(templateId);
  if (template === null || template.ownerOrganizationId !== null) {
    throw new NotFoundError("Template plateforme introuvable");
  }

  if (!installed) {
    await uninstallForOrganization(deps, actor, organizationId, templateId, "platform_uninstall");
    return;
  }

  await deps.templates.install(organizationId, template.id, actor.id, "platform_admin");
  await deps.audit?.record({
    organizationId,
    templateId: template.id,
    actorId: actor.id,
    event: "platform_install",
  });
}

export async function disableVisualTemplate(
  deps: VisualTemplateInstallationDependencies,
  actor: Actor,
  templateId: string,
  disabled: boolean,
  reason: string | null,
): Promise<VisualTemplate> {
  assertSuperAdmin(actor);
  const template = await deps.templates.setDisabled(templateId, disabled, actor.id, reason);
  if (template === null) throw new NotFoundError("Template visuel introuvable");
  await deps.audit?.record({
    organizationId: template.ownerOrganizationId,
    templateId: template.id,
    actorId: actor.id,
    event: disabled ? "disable" : "enable",
    metadata: reason === null ? {} : { reason },
  });
  return template;
}
