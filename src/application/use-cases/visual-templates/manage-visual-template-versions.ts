import { type Actor, assertCan, organizationOf } from "@/application/actor";
import {
  ForbiddenError,
  NotFoundError,
  TemplateVersionInUseError,
  TemplateVersionNotUninstallableError,
} from "@/application/errors";
import type { MediaStorage } from "@/application/ports/media-storage";
import type { VisualTemplateAuditRepository } from "@/application/ports/visual-template-audit-repository";
import type {
  VisualTemplate,
  VisualTemplateRepository,
  VisualTemplateVersion,
  VisualTemplateVersionUsage,
} from "@/application/ports/visual-template-repository";

export type VisualTemplateVersionDependencies = {
  templates: VisualTemplateRepository;
  storage: MediaStorage;
  audit?: VisualTemplateAuditRepository;
};

async function manageableTemplate(
  deps: VisualTemplateVersionDependencies,
  actor: Actor,
  templateId: string,
): Promise<VisualTemplate> {
  assertCan(actor, "visualtemplates:uninstall");
  if (actor.isSuperAdmin) {
    const template = await deps.templates.findById(templateId);
    if (template === null) throw new NotFoundError("Template visuel introuvable");
    return template;
  }
  const organizationId = organizationOf(actor);
  const template = await deps.templates.findByIdForOrganization(organizationId, templateId, true);
  if (template === null) throw new NotFoundError("Template visuel introuvable");
  if (template.ownerOrganizationId !== organizationId) {
    throw new ForbiddenError("Seul le propriétaire du template peut gérer ses versions");
  }
  return template;
}

async function targetVersion(
  deps: VisualTemplateVersionDependencies,
  template: VisualTemplate,
  version: string,
): Promise<VisualTemplateVersion> {
  const found = await deps.templates.findVersion(template.id, version);
  if (found === null) throw new NotFoundError(`Version ${version} introuvable`);
  return found;
}

export async function setVisualTemplateVersionDisabled(
  deps: VisualTemplateVersionDependencies,
  actor: Actor,
  templateId: string,
  version: string,
  disabled: boolean,
  reason: string | null,
): Promise<VisualTemplateVersion> {
  const template = await manageableTemplate(deps, actor, templateId);
  await targetVersion(deps, template, version);
  const updated = await deps.templates.setVersionDisabled(
    template.id,
    version,
    disabled,
    actor.id,
    disabled ? reason : null,
  );
  if (updated === null) throw new NotFoundError(`Version ${version} introuvable`);
  await deps.audit?.record({
    organizationId: template.ownerOrganizationId,
    templateId: template.id,
    actorId: actor.id,
    event: disabled ? "version_disabled" : "version_enabled",
    metadata: disabled ? { version, reason } : { version },
  });
  return updated;
}

export type UninstallVisualTemplateVersionResult = {
  template: VisualTemplate;
  version: VisualTemplateVersion;
  usage: VisualTemplateVersionUsage;
  storageCleanupFailed: number;
};

export async function uninstallVisualTemplateVersion(
  deps: VisualTemplateVersionDependencies,
  actor: Actor,
  templateId: string,
  version: string,
): Promise<UninstallVisualTemplateVersionResult> {
  const template = await manageableTemplate(deps, actor, templateId);
  const found = await targetVersion(deps, template, version);
  const [usage, versions] = await Promise.all([
    deps.templates.getVersionUsage(template.id, version),
    deps.templates.listVersions(template.id),
  ]);

  if (usage.links > 0 || usage.bindings > 0) {
    throw new TemplateVersionInUseError(version, usage);
  }
  if (versions.length <= 1) {
    throw new TemplateVersionNotUninstallableError(
      "Impossible de désinstaller la dernière version du template.",
    );
  }
  if (found.disabledAt === null && found.healthStatus !== "error") {
    throw new TemplateVersionNotUninstallableError(
      "Désactivez d'abord cette version avant de la désinstaller.",
    );
  }

  const deletion = await deps.templates.deleteVersion(template.id, version);
  if (!deletion.deleted) throw new NotFoundError(`Version ${version} introuvable`);

  let storageCleanupFailed = 0;
  for (const key of deletion.assetKeys) {
    try {
      await deps.storage.remove(key);
    } catch {
      storageCleanupFailed += 1;
    }
  }

  await deps.audit?.record({
    organizationId: template.ownerOrganizationId,
    templateId: template.id,
    actorId: actor.id,
    event: "version_uninstalled",
    metadata: {
      version,
      assets: usage.assets,
      links: usage.links,
      bindings: usage.bindings,
      storageCleanupFailed,
    },
  });

  return { template, version: found, usage, storageCleanupFailed };
}
