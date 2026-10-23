import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { NotFoundError } from "@/application/errors";
import type { MediaStorage } from "@/application/ports/media-storage";
import type {
  VisualTemplate,
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";

export type VisualTemplatesDependencies = {
  templates: VisualTemplateRepository;
};

/** US-TEMPLATE-001 — liste des templates visuels installés (lecture). */
export async function listVisualTemplates(
  deps: VisualTemplatesDependencies,
  actor: Actor,
): Promise<VisualTemplate[]> {
  assertCan(actor, "visualtemplates:list");
  if (actor.isSuperAdmin) return deps.templates.list();
  return deps.templates.listForOrganization(organizationOf(actor));
}

export type VisualTemplateDetail = {
  template: VisualTemplate;
  versions: VisualTemplateVersion[];
};

/** US-TEMPLATE-001 — détail d'un template (ses versions installées). */
export async function getVisualTemplate(
  deps: VisualTemplatesDependencies,
  actor: Actor,
  id: string,
): Promise<VisualTemplateDetail> {
  assertCan(actor, "visualtemplates:read");
  const template = actor.isSuperAdmin
    ? await deps.templates.findById(id)
    : await deps.templates.findAssignedById(organizationOf(actor), id);
  if (template === null) {
    throw new NotFoundError("Template visuel introuvable");
  }
  const versions = await deps.templates.listVersions(template.id);
  return { template, versions };
}

export type ResolvedAsset = {
  data: Buffer;
  contentType: string;
};

export type ResolveAssetDependencies = {
  templates: VisualTemplateRepository;
  storage: MediaStorage;
};

/**
 * Sert un asset d'une version (public) : résolution (template → version → asset),
 * puis lecture via `MediaStorage`. Le type MIME fait foi depuis la base.
 */
export async function resolveVisualTemplateAsset(
  deps: ResolveAssetDependencies,
  input: { templateId: string; version: string; path: string },
): Promise<ResolvedAsset | null> {
  const template = await deps.templates.findById(input.templateId);
  if (template === null) return null;
  const version = await deps.templates.findVersion(template.id, input.version);
  if (version === null) return null;
  const asset = await deps.templates.findAsset(version.id, input.path);
  if (asset === null) return null;
  const file = await deps.storage.read(asset.storageKey);
  if (file === null) return null;
  return { data: file.data, contentType: asset.mime || file.contentType };
}
